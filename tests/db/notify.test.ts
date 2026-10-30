// M5 notify against a local Supabase, with a fake mail sender:
//   - a needs_input application is emailed with its blocking question, from and to the job inbox
//   - the next run sends nothing (already notified in that status)
//   - a second email inside the minimum interval is held, then sent once the interval passes
//   - quiet hours hold the email
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { OutgoingEmail, SmtpConfig } from "@/server/integrations/email/smtp";
import { runNotify } from "@/server/modules/notifications/notifications.service";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let companyId = "";
const jobIds: string[] = [];
const appIds: string[] = [];
let previousSettings: unknown;

const sent: { config: SmtpConfig; email: OutgoingEmail }[] = [];
const createSender = (config: SmtpConfig) => async (email: OutgoingEmail) => {
  sent.push({ config, email });
  return `<${randomUUID()}@test>`;
};

// Noon in New York: outside the default quiet hours.
const noon = new Date("2026-10-30T16:00:00Z");
const notify = (now: Date) => runNotify({ db, password: "test-password", createSender, now });

async function addApplication(key: string, status: string): Promise<string> {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_id: companyId, company_name: `NotifyCo ${tag}`, source: "greenhouse", external_id: `${tag}:${key}`, url: `https://example.test/${tag}/${key}`, title: `Engineer ${key} ${tag}`, dedup_key: `${tag}-notify-${key}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data: app, error } = await db.from("applications").insert({ job_id: job!.id, status }).select("id").single();
  if (error) throw new Error(error.message);
  appIds.push(app!.id);
  return app!.id;
}

/** Marks every other application notified, so only this file's rows are due. */
async function quietOthers() {
  const { data } = await db.from("applications").select("id, status").not("id", "in", `(${appIds.join(",") || randomUUID()})`);
  for (const row of data ?? []) await db.from("applications").update({ notified_status: row.status }).eq("id", row.id);
}

beforeAll(async () => {
  const { data } = await db.from("settings").select("value").eq("key", "notifications").single();
  previousSettings = data!.value;
  await db.from("settings").upsert({ key: "notifications", value: { to: null, quiet_start: "22:00", quiet_end: "07:00", timezone: "America/New_York", min_interval_minutes: 15 } });
  await db.from("worker_runs").delete().eq("worker", "notify");
  const { data: company } = await db.from("companies").insert({ name: `NotifyCo ${tag}`, ats: "greenhouse", board_token: `notify${tag}` }).select("id").single();
  companyId = company!.id;

  const appId = await addApplication("blocked", "needs_input");
  await db.from("application_questions").insert({ application_id: appId, question: `Clearance ${tag}?`, field_name: "q1", field_type: "text", required: true, bucket: "needs_user", sort_order: 0 });
  await quietOthers();
});

afterAll(async () => {
  await db.from("applications").delete().in("id", appIds);
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("companies").delete().eq("id", companyId);
  await db.from("worker_runs").delete().eq("worker", "notify");
  await db.from("settings").upsert({ key: "notifications", value: previousSettings as never });
});

describe("notify", () => {
  it("emails a needs-you application with its question, from and to the job inbox", async () => {
    const { counts } = await notify(noon);
    expect(counts).toMatchObject({ due: 1, sent: 1, applications: 1 });
    expect(sent).toHaveLength(1);
    const { config, email } = sent[0];
    expect(config).toMatchObject({ host: "smtp.purelymail.com", port: 465, user: "jobs@malikhenry.com", password: "test-password" });
    expect(email.to).toBe("jobs@malikhenry.com");
    expect(email.subject).toBe("[Autopilot] 1 needs you");
    expect(email.text).toContain(`Question: Clearance ${tag}?`);
    expect(email.text).toContain(`/app/applications/${appIds[0]}`);
    expect(email.headers).toEqual({ "X-Autopilot": "notify" });

    const { data: app } = await db.from("applications").select("notified_status").eq("id", appIds[0]).single();
    expect(app!.notified_status).toBe("needs_input");
  });

  it("sends nothing when nothing new is due", async () => {
    const { counts } = await notify(new Date(noon.getTime() + 60 * 60_000));
    expect(counts).toMatchObject({ due: 0, sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it("holds a second email inside the minimum interval, then sends it", async () => {
    await addApplication("manual", "manual");
    const soon = await notify(new Date(noon.getTime() + 5 * 60_000));
    expect(soon.counts).toMatchObject({ due: 1, sent: 0, held_interval: 1 });

    // The last send was recorded at the real clock time, so step past it.
    const later = await notify(new Date(Date.now() + 16 * 60_000));
    expect(later.counts).toMatchObject({ due: 1, sent: 1 });
    expect(sent.at(-1)!.email.subject).toBe("[Autopilot] 1 to apply yourself");
  });

  it("holds email during quiet hours", async () => {
    await addApplication("review", "queued");
    const night = new Date("2026-10-31T03:00:00Z"); // 23:00 in New York
    const { counts } = await notify(night);
    expect(counts).toMatchObject({ due: 1, sent: 0, held_quiet: 1 });
  });
});
