// M2 acceptance against a local Supabase: the discover worker with mocked boards.
//   - a run inserts jobs; a second run inserts none and advances last_seen_at
//   - a job removed from its board gets closed_at (and reopens if relisted)
//   - a failing board records ok=false without failing the others, then backs off
//   - only the service role may call the sync functions
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ashbyBody, fakeFetch, greenhouseBody, leverBody, type FixtureJob } from "@/server/integrations/ats/test-fixtures";
import { runDiscover } from "@/server/modules/discovery/discovery.service";
import type {} from "./setup";
import { setUserSettings, testUser } from "./users";

const { url: URL, anonKey: ANON, serviceRoleKey: SERVICE } = inject("supabase");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);
const anon = createClient(URL, ANON, opts);

const tag = randomUUID().slice(0, 8);
const dupCompany = `DupCo ${tag}`;
const boards = {
  ghA: { ats: "greenhouse", name: dupCompany, token: `gha${tag}` },
  ghB: { ats: "greenhouse", name: `Beta ${tag}`, token: `ghb${tag}` },
  lvA: { ats: "lever", name: `Gamma ${tag}`, token: `lva${tag}` },
  lvB: { ats: "lever", name: `Delta ${tag}`, token: `lvb${tag}` },
  abA: { ats: "ashby", name: dupCompany, token: `aba${tag}` },
} as const;
type BoardKey = keyof typeof boards;

// Board contents; tests mutate these between runs.
const listings: Record<BoardKey, FixtureJob[]> = {
  ghA: [
    { id: "101", title: "Platform Engineer", location: "Remote - US" },
    { id: "102", title: "Data Engineer" },
    { id: "103", title: "Designer" },
  ],
  ghB: [{ id: "201", title: "Backend Engineer" }, { id: "202", title: "SRE" }],
  lvA: [{ id: `l1-${tag}`, title: "Frontend Engineer" }, { id: `l2-${tag}`, title: "Engineering Intern" }],
  lvB: [{ id: `l3-${tag}`, title: "Product Manager" }],
  // Same company, title and location as ghA's 101: the second sighting is a duplicate.
  abA: [{ id: `a1-${tag}`, title: "Platform Engineer", location: "Remote - US" }, { id: `a2-${tag}`, title: "Analyst" }],
};
const failing = new Set<BoardKey>();

const companyIds: Record<string, string> = {};
const runIds: string[] = [];
let userId = "";
let cleanupUser = async () => {};
let restoreSettings = async () => {};
let strangerId: string | undefined;

function routes() {
  const r: Record<string, unknown> = {};
  for (const [key, b] of Object.entries(boards) as [BoardKey, (typeof boards)[BoardKey]][]) {
    const body = b.ats === "greenhouse" ? greenhouseBody(listings[key]) : b.ats === "lever" ? leverBody(listings[key]) : ashbyBody(listings[key]);
    r[`/${b.token}`] = failing.has(key) ? { status: 500 } : body;
  }
  return r;
}

async function discover() {
  const summary = await runDiscover({
    db: service,
    fetchFn: fakeFetch(routes()),
    sleep: async () => {},
    hostDelayMs: 0,
    onlyCompanyIds: Object.values(companyIds),
  });
  runIds.push(summary.runId);
  return summary.counts;
}

async function jobsFor(key: BoardKey) {
  const { data, error } = await service
    .from("jobs")
    .select("external_id, title, last_seen_at, closed_at, company_name, source")
    .eq("company_id", companyIds[key])
    .order("external_id");
  if (error) throw error;
  return data;
}

async function lastBoardRun(key: BoardKey) {
  const { data } = await service
    .from("worker_runs")
    .select("ok, error, counts, finished_at")
    .eq("worker", "discover")
    .eq("source", `${boards[key].ats}:${boards[key].token}`)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

beforeAll(async () => {
  for (const [key, b] of Object.entries(boards)) {
    const { data, error } = await service
      .from("companies")
      .insert({ name: b.name, ats: b.ats, board_token: b.token })
      .select("id")
      .single();
    if (error) throw error;
    companyIds[key] = data.id;
  }
  // Discovery checks boards someone follows, with every user's filters (only this user locally).
  ({ id: userId, cleanup: cleanupUser } = await testUser(service));
  await service.from("user_companies").insert(Object.values(companyIds).map((company_id) => ({ user_id: userId, company_id })));
  // Keep every work type and place so these tests don't depend on the local owner's filter.
  restoreSettings = await setUserSettings(service, userId, {
    discover_filter: { include: [], exclude: ["intern"] },
    discover_job_filter: { work_types: [], locations: [], max_age_days: 90 },
  });
});

afterAll(async () => {
  const ids = Object.values(companyIds);
  await service.from("jobs").delete().in("company_id", ids);
  await service.from("companies").delete().in("id", ids);
  await service.from("worker_runs").delete().in("source", Object.values(boards).map((b) => `${b.ats}:${b.token}`));
  await service.from("worker_runs").delete().in("id", runIds);
  await restoreSettings();
  await cleanupUser();
  if (strangerId) await service.auth.admin.deleteUser(strangerId);
});

describe("discover worker", () => {
  it("inserts jobs from every board, filtering and de-duplicating", async () => {
    const counts = await discover();
    expect(counts).toMatchObject({ boards: 5, ok: 5, failed: 0, skipped: 0, fetched: 10, filtered: 1, new: 9 });
    expect(counts.inserted).toBe(8);
    expect(counts.duplicates).toBe(1);

    expect((await jobsFor("ghA")).length + (await jobsFor("abA")).length).toBe(4);
    expect((await jobsFor("lvA")).map((j) => j.title)).toEqual(["Frontend Engineer"]);
    expect(await lastBoardRun("ghB")).toMatchObject({ ok: true, error: null });
  });

  it("inserts nothing on a second run and advances last_seen_at", async () => {
    const before = await jobsFor("ghB");
    const counts = await discover();
    // The cross-source duplicate is never stored under its second board, so it is
    // offered again each run and skipped again by dedup_key.
    expect(counts).toMatchObject({ inserted: 0, new: 1, duplicates: 1, closed: 0, ok: 5 });

    const after = await jobsFor("ghB");
    expect(after).toHaveLength(before.length);
    for (const [i, job] of after.entries()) {
      expect(new Date(job.last_seen_at).getTime()).toBeGreaterThan(new Date(before[i].last_seen_at).getTime());
    }
  });

  it("closes a job that left its board and reopens it when relisted", async () => {
    const removed = listings.ghA.pop()!;
    expect((await discover()).closed).toBe(1);
    const closed = (await jobsFor("ghA")).find((j) => j.external_id === removed.id);
    expect(closed?.closed_at).not.toBeNull();
    // ghA and abA run in parallel, so either may hold the shared "Platform Engineer".
    const open = [...(await jobsFor("ghA")), ...(await jobsFor("abA"))].filter((j) => j.closed_at === null);
    expect(open).toHaveLength(3);

    listings.ghA.push(removed);
    await discover();
    expect((await jobsFor("ghA")).find((j) => j.external_id === removed.id)?.closed_at).toBeNull();
  });

  it("records a failing board without failing the others or closing its jobs", async () => {
    failing.add("ghB");
    const counts = await discover();
    expect(counts).toMatchObject({ boards: 5, ok: 4, failed: 1 });

    const run = await lastBoardRun("ghB");
    expect(run).toMatchObject({ ok: false });
    expect(run?.error).toMatch(/HTTP 500/);
    expect(run?.finished_at).not.toBeNull();
    expect((await jobsFor("ghB")).every((j) => j.closed_at === null)).toBe(true);
    expect(await lastBoardRun("lvA")).toMatchObject({ ok: true });
  });

  it("backs off a board after two failures in a row", async () => {
    expect((await discover()).failed).toBe(1); // second failure
    const counts = await discover();
    expect(counts).toMatchObject({ skipped: 1, failed: 0, ok: 4 });
    failing.delete("ghB");
  });

  it("writes a finished run row for the whole run", async () => {
    const { data } = await service.from("worker_runs").select("ok, source, counts, finished_at").eq("id", runIds.at(-1)!).single();
    expect(data).toMatchObject({ ok: true, source: null });
    expect(data?.finished_at).not.toBeNull();
    expect(data?.counts).toMatchObject({ boards: 5, skipped: 1 });
  });
});

describe("interrupted runs", () => {
  it("marks a run that never finished as failed on the next run", async () => {
    const source = `${boards.ghA.ats}:${boards.ghA.token}`;
    const { data, error } = await service
      .from("worker_runs")
      .insert({ worker: "discover", source, started_at: new Date(Date.now() - 2 * 3600_000).toISOString() })
      .select("id")
      .single();
    if (error) throw error;
    await discover();
    const { data: row } = await service.from("worker_runs").select("ok, error, finished_at").eq("id", data.id).single();
    expect(row).toMatchObject({ ok: false, error: "interrupted (no finish recorded)" });
    expect(row?.finished_at).not.toBeNull();
  });
});

describe("sync function permissions", () => {
  const args = {
    insert: { p_jobs: [] },
    sync: { p_company_id: randomUUID(), p_source: "greenhouse", p_external_ids: [] },
  };

  it("denies anonymous callers", async () => {
    expect((await anon.rpc("insert_discovered_jobs", args.insert)).error).not.toBeNull();
    expect((await anon.rpc("sync_board", args.sync)).error).not.toBeNull();
  });

  it("denies signed-in users (only the worker's service role may call them)", async () => {
    const email = `test-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    strangerId = data.user.id;
    const user = createClient(URL, ANON, opts);
    await user.auth.signInWithPassword({ email, password });

    expect((await user.rpc("insert_discovered_jobs", args.insert)).error?.message).toMatch(/permission denied/);
    expect((await user.rpc("sync_board", args.sync)).error?.message).toMatch(/permission denied/);
  });
});
