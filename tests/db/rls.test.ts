// Integration tests against a local Supabase (`pnpm db:start`).
// Covers M1 acceptance: anon and signed-in users not in `users` are denied on
// every table, the owner can read/write, members see only their own rows, and
// status changes are forced through transition_application() with an events row.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { setOwner } from "@/server/auth/owner.repository";
import type { Db } from "@/server/db/types";
import { IllegalTransitionError, transition } from "@/server/modules/applications/applications.repository";
import type {} from "./setup";

const { url: URL, anonKey: ANON, serviceRoleKey: SERVICE } = inject("supabase");

// Error codes for a table that doesn't exist (PostgREST schema cache, Postgres).
const MISSING = ["PGRST205", "42P01"];

// Every table and view in the public schema.
const TABLES = [
  "application_events", "application_evidence_items", "application_questions", "application_status_transitions",
  "applications", "certifications", "companies", "educations", "emails", "employment_responsibilities",
  "employment_skills", "employments", "jobs", "lessons", "llm_calls", "match_criteria", "matches", 
  "profile_skills", "profiles", "public_applications", "question_aliases", "question_answers", "questions",
  "resumes", "settings", "skill_aliases", "skills", "user_companies", "user_settings", "users", "work_authorizations",
  "worker_runs", "worker_source_statuses",
];

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);
const anon = createClient(URL, ANON, opts);

let owner: SupabaseClient;
let stranger: SupabaseClient;
let member: SupabaseClient;
const userIds: string[] = [];
const jobIds: string[] = [];
let previousOwner: string | null = null;

async function signedInUser(): Promise<SupabaseClient> {
  const email = `test-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(URL, ANON, opts);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return client;
}

async function insertJob(db: SupabaseClient) {
  const key = randomUUID();
  const { data, error } = await db.from("jobs").insert({
    company_name: "Acme", source: "greenhouse", external_id: key,
    url: `https://example.test/jobs/${key}`, title: "Engineer", dedup_key: key,
  }).select().single();
  if (error) throw error;
  jobIds.push(data.id);
  return data;
}

async function insertApplication(db: SupabaseClient) {
  const job = await insertJob(db);
  const { data, error } = await db.from("applications").insert({ user_id: userIds[0], job_id: job.id }).select().single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { data } = await service.from("users").select("id").eq("role", "owner").maybeSingle();
  previousOwner = data?.id ?? null;

  owner = await signedInUser();
  stranger = await signedInUser();
  member = await signedInUser();
  await setOwner(service as unknown as Db, userIds[0]);
  await service.from("users").insert({ id: userIds[2], role: "member" });
});

afterAll(async () => {
  // Leave the local database as we found it (events cascade from both).
  await service.from("applications").delete().in("job_id", jobIds);
  await service.from("jobs").delete().in("id", jobIds);
  if (previousOwner) await setOwner(service as unknown as Db, previousOwner);
  await service.from("users").delete().in("id", userIds);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
});

describe("anonymous access", () => {
  it.each(TABLES)("cannot read %s", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(1);
    expect(MISSING).not.toContain(error?.code); // a missing table must fail, not pass as "denied"
    expect(error !== null || data?.length === 0).toBe(true);
  });

  it("cannot read public_applications directly", async () => {
    const { data, error } = await anon.from("public_applications").select("*");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("cannot sign up", async () => {
    const { data, error } = await anon.auth.signUp({ email: `signup-${randomUUID()}@example.test`, password: randomUUID() });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("cannot insert", async () => {
    const { error } = await anon.from("companies").insert({ name: "x", ats: "greenhouse", board_token: randomUUID() });
    expect(error).not.toBeNull();
  });

  it("cannot call transition_application", async () => {
    const app = await insertApplication(service);
    const { error } = await anon.rpc("transition_application", {
      p_application_id: app.id, p_to: "skipped", p_cause: "user:skip",
    });
    expect(error).not.toBeNull();
  });
});

describe("authenticated non-owner", () => {
  it.each(TABLES)("sees no rows in %s", async (table) => {
    const { data, error } = await stranger.from(table).select("*").limit(5);
    expect(MISSING).not.toContain(error?.code);
    if (error) return; // permission denied is also acceptable
    expect(data).toEqual([]);
  });

  it("cannot insert", async () => {
    const { error } = await stranger.from("companies").insert({ name: "x", ats: "lever", board_token: randomUUID() });
    expect(error).not.toBeNull();
  });

  it("cannot transition the owner's application", async () => {
    const app = await insertApplication(service);
    const { error } = await stranger.rpc("transition_application", {
      p_application_id: app.id, p_to: "skipped", p_cause: "user:skip",
    });
    expect(error).not.toBeNull();
    const { data } = await service.from("applications").select("status").eq("id", app.id).single();
    expect(data?.status).toBe("queued");
  });
});

describe("owner", () => {
  it("can read global settings", async () => {
    const { data, error } = await owner.from("settings").select("key, value").eq("key", "app_url").single();
    expect(error).toBeNull();
    expect(typeof data?.value).toBe("string");
  });

  it("can create jobs and applications, and creation is logged", async () => {
    const app = await insertApplication(owner);
    const { data: events } = await owner.from("application_events").select("*").eq("application_id", app.id);
    expect(events).toHaveLength(1);
    expect(events![0]).toMatchObject({ from_status: null, to_status: "queued", cause: "system:create" });
  });

  it("cannot read the users table", async () => {
    const { data } = await owner.from("users").select("*");
    expect(data ?? []).toEqual([]);
  });
});

describe("member", () => {
  it("sees shared jobs but not another user's applications", async () => {
    const app = await insertApplication(owner);
    const { data: jobs } = await member.from("jobs").select("id").eq("id", app.job_id);
    expect(jobs).toHaveLength(1);
    const { data: apps } = await member.from("applications").select("id").eq("id", app.id);
    expect(apps).toEqual([]);
    const { data: events } = await member.from("application_events").select("id").eq("application_id", app.id);
    expect(events).toEqual([]);
  });

  it("can only write rows of their own", async () => {
    const { error: own } = await member.from("lessons").insert({ rule: "Mine", scope: "global" });
    expect(own).toBeNull(); // user_id defaults to the member
    const { error: other } = await member.from("lessons").insert({ user_id: userIds[0], rule: "Theirs", scope: "global" });
    expect(other).not.toBeNull();
    await service.from("lessons").delete().eq("user_id", userIds[2]);
  });

  it("cannot change shared jobs", async () => {
    const app = await insertApplication(owner);
    await member.from("jobs").update({ title: "Hacked" }).eq("id", app.job_id);
    const { data } = await service.from("jobs").select("title").eq("id", app.job_id).single();
    expect(data?.title).toBe("Engineer");
  });
});

describe("status transitions", () => {
  it("allows a legal move, stamps timestamps and logs an event", async () => {
    const app = await insertApplication(owner);
    const updated = await transition(owner, app.id, "approved", "user:approve", { via: "test" });
    expect(updated.status).toBe("approved");
    expect(updated.approved_at).not.toBeNull();

    const { data: events } = await owner.from("application_events").select("*")
      .eq("application_id", app.id).order("id");
    expect(events!.at(-1)).toMatchObject({
      from_status: "queued", to_status: "approved", cause: "user:approve", detail: { via: "test" },
    });
  });

  it("rejects an illegal move without writing an event", async () => {
    const app = await insertApplication(owner);
    await expect(transition(owner, app.id, "offer", "user:approve")).rejects.toBeInstanceOf(IllegalTransitionError);
    const { data: events } = await owner.from("application_events").select("id").eq("application_id", app.id);
    expect(events).toHaveLength(1); // only the creation event
  });

  it("rejects a malformed cause before calling the database", async () => {
    const app = await insertApplication(owner);
    await expect(transition(owner, app.id, "skipped", "because")).rejects.toThrow(/invalid cause/);
  });

  it.each([["owner", () => owner], ["service role", () => service]])(
    "blocks raw status updates by the %s",
    async (_label, db) => {
      const app = await insertApplication(service);
      const { error } = await db().from("applications").update({ status: "submitted" }).eq("id", app.id);
      expect(error?.message).toMatch(/transition_application/);
    },
  );

  it("still allows updates to non-status columns", async () => {
    const app = await insertApplication(owner);
    const { error } = await owner.from("applications").update({ cover_letter: "hi" }).eq("id", app.id);
    expect(error).toBeNull();
  });
});
