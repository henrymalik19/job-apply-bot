// Moving submitted applications that heard nothing to No reply, against a local Supabase:
//   - 30 days with no status change, or 14 once the posting closed
//   - a reply after that still moves it on
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { markNoReply, moveApplication } from "@/server/modules/applications/applications.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
let userId = "";
let cleanupUser = async () => {};
const jobIds: string[] = [];
const apps: Record<string, string> = {};

async function addApp(key: string, status: string, quietDays: number, closed: boolean) {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `Quietco ${tag}`, source: "greenhouse", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: "Engineer", dedup_key: `${tag}-${key}`, closed_at: closed ? daysAgo(3) : null })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data: app, error } = await db
    .from("applications")
    .insert({ user_id: userId, job_id: job!.id, status, submitted_at: daysAgo(quietDays), last_status_at: daysAgo(quietDays) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  apps[key] = app!.id;
}

const status = async (key: string) => (await db.from("applications").select("status").eq("id", apps[key]).single()).data!.status;

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  await addApp("old", "submitted", 31, false);
  await addApp("oldconfirmed", "confirmed", 40, false);
  await addApp("closed", "submitted", 15, true);
  await addApp("recent", "submitted", 15, false);
});

afterAll(async () => {
  await db.from("applications").delete().in("job_id", jobIds);
  await db.from("jobs").delete().in("id", jobIds);
  await cleanupUser();
});

describe("no reply", () => {
  it("moves applications quiet for 30 days, or 14 once the posting closed, and leaves recent ones", async () => {
    expect(await markNoReply(db, now)).toBeGreaterThanOrEqual(3);
    expect(await status("old")).toBe("no_reply");
    expect(await status("oldconfirmed")).toBe("no_reply");
    expect(await status("closed")).toBe("no_reply");
    expect(await status("recent")).toBe("submitted");
  });

  it("still takes a reply that comes later", async () => {
    await moveApplication(db, userId, apps.old, "interviewing");
    expect(await status("old")).toBe("interviewing");
    await moveApplication(db, userId, apps.closed, "submitted");
    expect(await status("closed")).toBe("submitted");
  });
});
