// Discovery: fetch every active board someone follows, insert new jobs that
// pass any user's search filters (each user's own filters are applied again at
// matching), refresh last_seen_at / closed_at, and write a runs row per board
// plus one for the whole run. Runs with the service-role client (RLS bypass)
// from the Railway worker.
import type { Db } from "@/server/db/types";
import { listActiveBoards, type BoardCompany } from "@/server/modules/companies/companies.service";
import {
  getJobFilter,
  getTitleFilter,
  jobFilterReason,
  passesTitleFilter,
  type JobFilter,
  type TitleFilter,
} from "@/server/modules/criteria/criteria.service";
import {
  deleteJobs,
  insertDiscoveredJobs,
  listExternalIds,
  listJobIdsWithApplications,
  listJobsForFiltering,
  syncBoard,
} from "@/server/modules/jobs/jobs.service";
import {
  boardSource,
  failInterruptedRuns,
  finishRun,
  listSourceStatus,
  shouldSkipBoard,
  startRun,
  type FilteredSample,
} from "@/server/modules/runs/runs.service";
import { boardUrl, locationsFromSaved, parseBoard, type BoardAts } from "@/server/integrations/ats/boards";
import { defaultSleep, fetchJson } from "@/server/integrations/ats/http";
import { listUsers } from "@/server/modules/users/users.service";
import { dedupKey } from "@/shared/text";

const WORKER = "discover";
const INSERT_CHUNK = 100;
/** Skipped titles kept per board run, for the Search page. */
const SAMPLES_PER_BOARD = 5;
/** A run with no finish after this long was killed (e.g. by a redeploy). */
const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;

/** Dependencies of a discovery run; tests inject fetch, time and pacing. */
export type DiscoverDeps = {
  /** Service-role client. */
  db: Db;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Pause between two requests to the same ATS host (default 1s). */
  hostDelayMs?: number;
  /** Only check these companies (tests). */
  onlyCompanyIds?: string[];
  log?: (line: string) => void;
};

/** What one board run did. `new` counts jobs not yet stored for this board. */
export type BoardCounts = {
  fetched: number;
  filtered: number;
  new: number;
  inserted: number;
  duplicates: number;
  seen: number;
  closed: number;
};

/** Totals for a whole run, plus the id of its worker-level `runs` row. */
export type DiscoverSummary = {
  runId: string;
  counts: { boards: number; ok: number; failed: number; skipped: number } & BoardCounts;
};

// `locations` is only for filtering; the jobs table stores the primary location.
function withoutLocations<T extends { locations: string[] }>(job: T): Omit<T, "locations"> {
  const row: Partial<T> = { ...job };
  delete row.locations;
  return row as Omit<T, "locations">;
}

/** One user's two discovery filters. */
type Filters = { title: TitleFilter; job: JobFilter };

/** Each user's discovery filters. */
async function loadFilters(db: Db, userIds: string[]): Promise<Filters[]> {
  return Promise.all(userIds.map(async (id) => ({ title: await getTitleFilter(db, id), job: await getJobFilter(db, id) })));
}

/**
 * Why no user wants a job (the first user's reason), or null when someone's
 * filters pass it.
 */
function skipReason(job: Parameters<typeof jobFilterReason>[0] & { title: string }, filters: Filters[], now: Date): string | null {
  let first: string | null = null;
  for (const f of filters) {
    const reason = passesTitleFilter(job.title, f.title) ? jobFilterReason(job, f.job, now) : "title";
    if (reason === null) return null;
    first ??= reason;
  }
  return first ?? "no users";
}

async function syncOneBoard(
  deps: DiscoverDeps,
  company: BoardCompany,
  filters: Filters[],
  now: Date,
): Promise<{ counts: BoardCounts; samples: FilteredSample[] }> {
  const { db } = deps;
  const body = await fetchJson(boardUrl(company.ats, company.board_token), { fetchFn: deps.fetchFn, sleep: deps.sleep });
  const jobs = parseBoard(company.ats, body);
  const samples: FilteredSample[] = [];
  const kept = jobs.filter((j) => {
    const reason = skipReason(j, filters, now);
    if (reason && samples.length < SAMPLES_PER_BOARD) samples.push({ title: j.title, company: company.name, reason });
    return reason === null;
  });
  const known = await listExternalIds(db, company.id, company.ats);
  const fresh = kept.filter((j) => !known.has(j.external_id));

  let inserted = 0;
  let duplicates = 0;
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const result = await insertDiscoveredJobs(
      db,
      fresh.slice(i, i + INSERT_CHUNK).map((j) => ({
        ...withoutLocations(j),
        company_id: company.id,
        company_name: company.name,
        source: company.ats,
        dedup_key: dedupKey(company.name, j.title, j.location),
      })),
    );
    inserted += result.inserted;
    duplicates += result.duplicates;
  }

  // Every listed id counts as seen, including ones the filter skipped this time.
  const synced = await syncBoard(db, company.id, company.ats, jobs.map((j) => j.external_id));
  const counts = {
    fetched: jobs.length,
    filtered: jobs.length - kept.length,
    new: fresh.length,
    inserted,
    duplicates,
    seen: synced.seen,
    closed: synced.closed,
  };
  return { counts, samples };
}

/**
 * Runs discovery once over every active board. Boards on the same ATS host are
 * fetched one at a time with a polite delay; different hosts run in parallel.
 * A failing board is recorded (`ok = false`) without failing the others, and a
 * board that failed twice in a row is skipped until its backoff passes.
 *
 * @throws Only when the run itself cannot proceed (e.g. the database is unreachable).
 */
export async function runDiscover(deps: DiscoverDeps): Promise<DiscoverSummary> {
  const { db, now = () => new Date(), sleep = defaultSleep, hostDelayMs = 1000, log = () => {} } = deps;
  const interrupted = await failInterruptedRuns(db, WORKER, new Date(now().getTime() - INTERRUPTED_AFTER_MS));
  if (interrupted) log(`closed ${interrupted} interrupted run(s) from an earlier process`);
  const runId = await startRun(db, WORKER, null);
  const totals: DiscoverSummary["counts"] = {
    boards: 0, ok: 0, failed: 0, skipped: 0,
    fetched: 0, filtered: 0, new: 0, inserted: 0, duplicates: 0, seen: 0, closed: 0,
  };

  try {
    const [boards, users, statuses] = await Promise.all([
      listActiveBoards(db, deps.onlyCompanyIds),
      listUsers(db),
      listSourceStatus(db, WORKER),
    ]);
    const filters = await loadFilters(db, users.map((u) => u.id));
    const statusBySource = new Map(statuses.map((s) => [s.source, s]));

    const byHost = new Map<BoardAts, BoardCompany[]>();
    for (const b of boards) byHost.set(b.ats, [...(byHost.get(b.ats) ?? []), b]);

    await Promise.all(
      [...byHost.values()].map(async (queue) => {
        for (const [i, company] of queue.entries()) {
          const source = boardSource(company.ats, company.board_token);
          totals.boards++;
          const status = statusBySource.get(source);
          if (shouldSkipBoard(status, now())) {
            totals.skipped++;
            log(`skip ${source} (backing off after ${status?.consecutive_failures} failures)`);
            continue;
          }
          if (i > 0) await sleep(hostDelayMs);

          const boardRunId = await startRun(db, WORKER, source);
          try {
            const { counts, samples } = await syncOneBoard(deps, company, filters, now());
            await finishRun(db, boardRunId, { ok: true, counts, samples });
            totals.ok++;
            for (const k of Object.keys(counts) as (keyof BoardCounts)[]) totals[k] += counts[k];
            log(`ok ${source} ${JSON.stringify(counts)}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await finishRun(db, boardRunId, { ok: false, counts: {}, error: message });
            totals.failed++;
            log(`fail ${source}: ${message}`);
          }
        }
      }),
    );

    await finishRun(db, runId, { ok: true, counts: totals });
    return { runId, counts: totals };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(db, runId, { ok: false, counts: totals, error: message }).catch(() => {});
    throw err;
  }
}

/** What a cleanup did. */
export type PruneResult = { checked: number; removed: number; kept: number };

/**
 * Re-applies the discovery filters (title, work type, location and posting
 * age) of the given users to jobs already saved and deletes the ones none of
 * them wants. Jobs with an application are always kept; with no users nothing
 * is deleted. Pass every user (the web app can only read its own filters, so
 * from there it is right only while one user exists).
 */
export async function pruneSavedJobs(db: Db, userIds: string[], now: Date): Promise<PruneResult> {
  const [jobs, filters, applied] = await Promise.all([
    listJobsForFiltering(db),
    loadFilters(db, userIds),
    listJobIdsWithApplications(db),
  ]);
  if (filters.length === 0) return { checked: jobs.length, removed: 0, kept: jobs.length };
  const remove = jobs
    .filter((j) => !applied.has(j.id))
    .filter(
      (j) =>
        skipReason(
          { title: j.title, remote_type: j.remote_type ?? "unknown", locations: locationsFromSaved(j.location, j.raw), posted_at: j.posted_at },
          filters,
          now,
        ) !== null,
    )
    .map((j) => j.id);
  await deleteJobs(db, remove);
  return { checked: jobs.length, removed: remove.length, kept: jobs.length - remove.length };
}
