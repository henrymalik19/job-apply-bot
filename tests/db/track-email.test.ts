// M6 email tracking against a local Supabase, with a fake inbox and Claude:
//   - a confirmation confirms the application and is kept as evidence
//   - a matched rejection rejects it and is moved out of the inbox (archived_at)
//   - an email the rules can't sort is sorted by Claude (an interview invite)
//   - one approved application a confirmation names is marked submitted, then confirmed
//   - an email naming a company you applied to twice, without the title, is left unmatched
//   - the digest's own mail is skipped, and a second run reads nothing twice
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import type { InboxMail } from "@/server/integrations/email/inbox";
import { REJECTIONS_FOLDER, runTrackEmail } from "@/server/modules/tracking/tracking.service";
import type {} from "./setup";
import { setUserSettings, testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let restoreSettings = async () => {};
const jobIds: string[] = [];
const apps: Record<string, string> = {};
const now = new Date();
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

/** An application at `company` for `title`, `status`, applied a day ago. */
async function addApp(key: string, company: string, title: string, status: string) {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: company, source: "greenhouse", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title, dedup_key: `${tag}-track-${key}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data, error } = await db
    .from("applications")
    .insert({ user_id: userId, job_id: job!.id, status, submitted_at: status === "submitted" ? ago(24 * 60).toISOString() : null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  apps[key] = data!.id;
}

const mail = (id: string, subject: string, text: string, extra: Partial<InboxMail> = {}): InboxMail => ({
  messageId: `<${tag}-${id}@mail.test>`,
  receivedAt: ago(30),
  fromAddress: "no-reply@us.greenhouse-mail.io",
  fromName: "",
  subject,
  text,
  headers: {},
  ...extra,
});

const inbox: InboxMail[] = [];
const moved: string[] = [];
// Claude sorts the one email the rules can't: a recruiter's note about a call.
const call: StructuredCall = async () => ({
  output: { kind: "interview", reason: "asks to set a time to talk" },
  model: "claude-haiku-5-5",
  usage: { input_tokens: 100, output_tokens: 20 },
}) as never;
const deps = () => ({
  db,
  userId,
  password: "unused",
  call,
  readMail: async () => inbox,
  moveMail: async (_c: unknown, messageId: string, folder: string) => {
    moved.push(`${messageId} -> ${folder}`);
    return true;
  },
});

async function status(key: string) {
  const { data } = await db.from("applications").select("status").eq("id", apps[key]).single();
  return data!.status;
}

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  restoreSettings = await setUserSettings(db, userId, { job_inbox: { address: "jobs@example.test" } });
  await db.from("emails").delete().eq("user_id", userId);
  await addApp("conf", `Confco ${tag}`, "Backend Engineer", "submitted");
  await addApp("rej", `Rejco ${tag}`, "Platform Engineer", "submitted");
  await addApp("int", `Talkco ${tag}`, "SRE", "submitted");
  await addApp("appr", `Lateco ${tag}`, "Data Engineer", "approved");
  await addApp("twin1", `Twinco ${tag}`, "Backend Engineer", "submitted");
  await addApp("twin2", `Twinco ${tag}`, "Product Designer", "submitted");
  await addApp("late", `Pinco ${tag}`, "Ads Engineer", "submitted");
  inbox.push(
    mail("c", `Thank you for applying to Confco ${tag}`, "We have received your application for Backend Engineer."),
    mail("r", `Your application to Rejco ${tag}`, "Thank you for applying. Unfortunately, we have decided to move forward with other candidates."),
    mail("i", "Quick question", `Hi! I'm a recruiter at Talkco ${tag}. Would you have 20 minutes this week?`, { fromAddress: "sam@talkco.test", fromName: "Sam" }),
    mail("a", `Thank you for applying to Lateco ${tag}`, "We have received your application."),
    mail("t", `Thank you for applying to Twinco ${tag}`, "We received your application."),
    mail("d", "[Autopilot] 2 ready to review", "Digest", { fromAddress: "jobs@example.test", headers: { "x-autopilot": "notify" } }),
  );
});

afterAll(async () => {
  await db.from("emails").delete().eq("user_id", userId);
  await db.from("applications").delete().in("job_id", jobIds);
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("worker_runs").delete().eq("worker", "track_email").eq("user_id", userId);
  await db.from("llm_calls").delete().eq("user_id", userId).eq("purpose", "track_email");
  await restoreSettings();
  await cleanupUser();
});

describe("track_email", () => {
  it("moves the applications the inbox is about", async () => {
    const { counts } = await runTrackEmail(deps());
    expect(counts).toMatchObject({ read: 6, new: 5, matched: 4, moved: 4, unmatched: 1, archived: 1 });

    expect(await status("conf")).toBe("confirmed");
    const { data: evidence } = await db.from("application_evidence_items").select("kind, email_message_id").eq("application_id", apps.conf);
    expect(evidence).toEqual([{ kind: "confirmation_email", email_message_id: `<${tag}-c@mail.test>` }]);

    expect(await status("rej")).toBe("rejected");
    expect(moved).toEqual([`<${tag}-r@mail.test> -> ${REJECTIONS_FOLDER}`]);
    const { data: rejection } = await db.from("emails").select("archived_at, application_id").eq("message_id", `<${tag}-r@mail.test>`).single();
    expect(rejection).toMatchObject({ application_id: apps.rej, archived_at: expect.any(String) });

    expect(await status("int")).toBe("interviewing");
    expect(await status("appr")).toBe("confirmed");
    expect([await status("twin1"), await status("twin2")]).toEqual(["submitted", "submitted"]);
    const { data: twin } = await db.from("emails").select("application_id, match_confidence, classification").eq("message_id", `<${tag}-t@mail.test>`).single();
    expect(twin).toEqual({ application_id: null, match_confidence: 0.5, classification: "confirmation" });
  });

  it("reads nothing twice", async () => {
    const { counts } = await runTrackEmail(deps());
    expect(counts).toMatchObject({ read: 6, new: 0, moved: 0 });
  });

  it("reads again an email saved as other that a rule now places", async () => {
    // Saved by an earlier run with no rule for its wording and no Claude to sort it.
    const pin = mail("p", `Your application for Ads Engineer at Pinco ${tag}`, `Thank you for your interest in joining the Pinco ${tag} team!`, { receivedAt: ago(120) });
    await db.from("emails").insert({ user_id: userId, message_id: pin.messageId, received_at: pin.receivedAt.toISOString(), from_addr: pin.fromAddress, subject: pin.subject, snippet: pin.text, classification: "other", reason: "no Claude to sort it" });
    inbox.push(pin);
    const { counts } = await runTrackEmail(deps());
    expect(counts).toMatchObject({ new: 1, moved: 1 });
    expect(await status("late")).toBe("confirmed");
    const { data } = await db.from("emails").select("classification").eq("message_id", pin.messageId);
    expect(data).toEqual([{ classification: "confirmation" }]);
  });
});
