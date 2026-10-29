// The discover worker: fetch every active board, insert new jobs, refresh
// last_seen_at / closed_at, and write a runs row per board plus one for the run.
// Uses the service-role client (RLS bypass); never import from client code.
import type { SupabaseClient } from "@supabase/supabase-js";
import { boardSource, shouldSkipBoard, SOURCE_STATUS_COLUMNS, type SourceStatus } from "../health";
import { defaultSleep, fetchJson } from "./fetch";
import { passesTitleFilter, titleFilterSchema, type TitleFilter } from "./filter";
import { BOARD_ATS, boardUrl, parseBoard, type BoardAts } from "./sources";
import { dedupKey } from "./text";

export type DiscoverDeps = {
  db: SupabaseClient;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  hostDelayMs?: number;
  onlyCompanyIds?: string[];
  log?: (line: string) => void;
};

type Company = { id: string; name: string; ats: BoardAts; board_token: string };

export type BoardCounts = {
  fetched: number;
  filtered: number;
  new: number;
  inserted: number;
  duplicates: number;
  seen: number;
  closed: number;
};

export type DiscoverSummary = {
  runId: string;
  counts: { boards: number; ok: number; failed: number; skipped: number } & BoardCounts;
};

const INSERT_CHUNK = 100;
const PAGE = 1000;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: no data returned`);
  return res.data as NonNullable<T>;
}

async function startRun(db: SupabaseClient, source: string | null): Promise<string> {
  const row = check(
    await db.from("runs").insert({ worker: "discover", source }).select("id").single(),
    "start run",
  );
  return row.id as string;
}

async function finishRun(db: SupabaseClient, id: string, ok: boolean, counts: object, error?: string) {
  const res = await db
    .from("runs")
    .update({ finished_at: new Date().toISOString(), ok, counts, error: error?.slice(0, 500) ?? null })
    .eq("id", id);
  if (res.error) throw new Error(`finish run: ${res.error.message}`);
}

async function existingIds(db: SupabaseClient, company: Company): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await db
        .from("jobs")
        .select("external_id")
        .eq("company_id", company.id)
        .eq("source", company.ats)
        .order("id")
        .range(from, from + PAGE - 1),
      "load existing jobs",
    );
    for (const r of rows) if (r.external_id) ids.add(r.external_id);
    if (rows.length < PAGE) return ids;
  }
}

async function syncBoard(deps: DiscoverDeps, company: Company, filter: TitleFilter): Promise<BoardCounts> {
  const { db } = deps;
  const body = await fetchJson(boardUrl(company.ats, company.board_token), { fetchFn: deps.fetchFn, sleep: deps.sleep });
  const jobs = parseBoard(company.ats, body);
  const kept = jobs.filter((j) => passesTitleFilter(j.title, filter));
  const known = await existingIds(db, company);
  const fresh = kept.filter((j) => !known.has(j.external_id));

  let inserted = 0;
  let duplicates = 0;
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const rows = fresh.slice(i, i + INSERT_CHUNK).map((j) => ({
      ...j,
      company_id: company.id,
      company_name: company.name,
      source: company.ats,
      dedup_key: dedupKey(company.name, j.title, j.location),
    }));
    const res = check(await db.rpc("insert_discovered_jobs", { p_jobs: rows }), "insert jobs");
    inserted += res.inserted;
    duplicates += res.duplicates;
  }

  // Every listed id counts as seen, including ones the filter skipped this time.
  const synced = check(
    await db.rpc("sync_board", {
      p_company_id: company.id,
      p_source: company.ats,
      p_external_ids: jobs.map((j) => j.external_id),
    }),
    "sync board",
  );

  return {
    fetched: jobs.length,
    filtered: jobs.length - kept.length,
    new: fresh.length,
    inserted,
    duplicates,
    seen: synced.seen,
    closed: synced.closed,
  };
}

export async function runDiscover(deps: DiscoverDeps): Promise<DiscoverSummary> {
  const { db, now = () => new Date(), sleep = defaultSleep, hostDelayMs = 1000, log = () => {} } = deps;
  const runId = await startRun(db, null);
  const totals: DiscoverSummary["counts"] = {
    boards: 0, ok: 0, failed: 0, skipped: 0,
    fetched: 0, filtered: 0, new: 0, inserted: 0, duplicates: 0, seen: 0, closed: 0,
  };

  try {
    let query = db
      .from("companies")
      .select("id, name, ats, board_token")
      .eq("active", true)
      .in("ats", [...BOARD_ATS])
      .not("board_token", "is", null)
      .order("priority", { ascending: false });
    if (deps.onlyCompanyIds) query = query.in("id", deps.onlyCompanyIds);
    const companies = check(await query, "load companies") as Company[];

    const setting = await db.from("settings").select("value").eq("key", "discover_filter").maybeSingle();
    if (setting.error) throw new Error(`load filter: ${setting.error.message}`);
    const filter = titleFilterSchema.parse(setting.data?.value ?? {});

    const statusRows = check(
      await db.from("run_source_status").select(SOURCE_STATUS_COLUMNS).eq("worker", "discover"),
      "load board status",
    ) as SourceStatus[];
    const statusBySource = new Map(statusRows.map((s) => [s.source, s]));

    // One queue per ATS host: sequential with a polite delay inside, parallel across hosts.
    const byHost = new Map<BoardAts, Company[]>();
    for (const c of companies) byHost.set(c.ats, [...(byHost.get(c.ats) ?? []), c]);

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

          const boardRunId = await startRun(db, source);
          try {
            const counts = await syncBoard(deps, company, filter);
            await finishRun(db, boardRunId, true, counts);
            totals.ok++;
            for (const k of Object.keys(counts) as (keyof BoardCounts)[]) totals[k] += counts[k];
            log(`ok ${source} ${JSON.stringify(counts)}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await finishRun(db, boardRunId, false, {}, message);
            totals.failed++;
            log(`fail ${source}: ${message}`);
          }
        }
      }),
    );

    await finishRun(db, runId, true, totals);
    return { runId, counts: totals };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(db, runId, false, totals, message).catch(() => {});
    throw err;
  }
}
