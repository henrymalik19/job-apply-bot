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
import { forgetOldEmails, linkEmail, listApplicationEmails, listUnsortedEmails, RECEIVED_FOLDER, REJECTIONS_FOLDER, runTrackEmail } from "@/server/modules/tracking/tracking.service";
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
// Claude sorts the email the rules can't (a recruiter's note about a call) and confirms rejections.
const calls: string[] = [];
const call: StructuredCall = async ({ user }) => {
  const kind = /unfortunately/i.test(user) ? "rejection" : /minutes this week/i.test(user) ? "interview" : "confirmation";
  calls.push(kind);
  return {
    output: { kind, reason: kind === "interview" ? "asks to set a time to talk" : `reads as a ${kind}` },
    model: "claude-haiku-5-5",
    usage: { input_tokens: 100, output_tokens: 20 },
  } as never;
};
const markedRead: string[] = [];
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
  mergeMail: async () => 0,
  markMailRead: async (_c: unknown, messageId: string) => {
    markedRead.push(messageId);
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
  await addApp("odd", `Oddco ${tag}`, "Platform Engineer", "submitted");
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
  await db.from("notifications").delete().eq("user_id", userId).like("dedupe_key", `email:<${tag}-%`);
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
    expect(counts).toMatchObject({ read: 6, new: 5, matched: 4, moved: 4, unmatched: 1, archived: 3, marked_read: 3 });
    // Receipts and the rejection are read; the interview invite stays unread.
    expect(markedRead.sort()).toEqual([`<${tag}-a@mail.test>`, `<${tag}-c@mail.test>`, `<${tag}-r@mail.test>`].sort());

    expect(await status("conf")).toBe("confirmed");
    const { data: evidence } = await db.from("application_evidence_items").select("kind, email_message_id").eq("application_id", apps.conf);
    expect(evidence).toEqual([{ kind: "confirmation_email", email_message_id: `<${tag}-c@mail.test>` }]);

    expect(await status("rej")).toBe("rejected");
    // Claude confirmed the rejection the rules found before it moved anything.
    expect(calls).toContain("rejection");
    const { data: rejReason } = await db.from("emails").select("reason").eq("message_id", `<${tag}-r@mail.test>`).single();
    expect(rejReason!.reason).toMatch(/^Claude: reads as a rejection/);
    // Receipts and the rejection are filed out of the inbox; the interview invite stays.
    expect(moved.sort()).toEqual(
      [`<${tag}-r@mail.test> -> ${REJECTIONS_FOLDER}`, `<${tag}-c@mail.test> -> ${RECEIVED_FOLDER}`, `<${tag}-a@mail.test> -> ${RECEIVED_FOLDER}`].sort(),
    );
    const { data: rejection } = await db.from("emails").select("archived_at, application_id").eq("message_id", `<${tag}-r@mail.test>`).single();
    expect(rejection).toMatchObject({ application_id: apps.rej, archived_at: expect.any(String) });

    expect(await status("int")).toBe("interviewing");
    // You hear about the interview invite, the rejection and the email it couldn't place; receipts aren't news.
    const { data: told } = await db.from("notifications").select("kind").eq("user_id", userId).like("dedupe_key", `email:<${tag}-%`);
    expect(told!.map((n) => n.kind).sort()).toEqual(["email_to_sort", "interview", "rejection"]);
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

  it("lists employer mail it couldn't sort, and links it once you say what it is", async () => {
    // From an ATS with wording no rule knows, saved while there was no Claude.
    const { data: row } = await db
      .from("emails")
      .insert({ user_id: userId, message_id: `<${tag}-odd@mail.test>`, received_at: ago(60).toISOString(), from_addr: "no-reply@us.greenhouse-mail.io", subject: `Oddco ${tag} update`, snippet: "We wanted to let you know where things stand.", classification: "other", reason: "no Claude to sort it" })
      .select("id")
      .single();
    const tracked = [{ id: apps.odd, status: "submitted", company: `Oddco ${tag}`, title: "Platform Engineer", submittedAt: null }];
    expect((await listUnsortedEmails(db, userId, tracked)).map((e) => e.id)).toContain(row!.id);

    await expect(linkEmail(db, userId, row!.id, apps.odd)).rejects.toThrow(/what the email says/);
    expect(await linkEmail(db, userId, row!.id, apps.odd, "rejection")).toBe("rejected");
    expect((await listUnsortedEmails(db, userId, tracked)).map((e) => e.id)).not.toContain(row!.id);
    expect((await listApplicationEmails(db, userId, apps.odd)).map((e) => [e.id, e.kind])).toEqual([[row!.id, "rejection"]]);

    // The next run files it out of the inbox, since linking in the app can't.
    moved.length = 0;
    const { counts } = await runTrackEmail(deps());
    expect(counts.filed_late).toBe(1);
    expect(moved).toEqual([`<${tag}-odd@mail.test> -> ${REJECTIONS_FOLDER}`]);
    const { data: after } = await db.from("emails").select("archived_at").eq("id", row!.id).single();
    expect(after!.archived_at).not.toBeNull();
    // And isn't looked for again.
    moved.length = 0;
    expect((await runTrackEmail(deps())).counts.filed_late).toBe(0);
    expect(moved).toEqual([]);
  });
});

describe("forgetting old emails", () => {
  it("forgets unsorted emails after 30 days and unlinked ones after 60, keeping those linked to an application", async () => {
    const day = 24 * 60;
    const { data: linkedApp } = await db.from("applications").select("id").eq("user_id", userId).limit(1).single();
    const row = (key: string, daysAgo: number, classification: string, applicationId: string | null = null) => ({
      user_id: userId, message_id: `<forget-${key}-${randomUUID()}@test>`, received_at: ago(daysAgo * day).toISOString(),
      from_addr: "someone@example.test", subject: key, snippet: key, classification, application_id: applicationId,
    });
    const { data } = await db
      .from("emails")
      .insert([
        row("other-old", 31, "other"),
        row("other-recent", 10, "other"),
        row("rejection-unlinked-45", 45, "rejection"),
        row("rejection-unlinked-61", 61, "rejection"),
        row("linked-old", 90, "other", linkedApp!.id),
      ])
      .select("id, subject");
    const forgotten = await forgetOldEmails(db, userId, now);
    const { data: left } = await db.from("emails").select("subject").in("id", data!.map((r) => r.id));
    await db.from("emails").delete().in("id", data!.map((r) => r.id));
    expect(forgotten).toBeGreaterThanOrEqual(2);
    expect(left!.map((r) => r.subject).sort()).toEqual(["linked-old", "other-recent", "rejection-unlinked-45"]);
  });
});

describe("rechecking recent emails", () => {
  it("corrects a receipt the rules took for a rejection, and ties one it couldn't match", async () => {
    // A receipt saved as a rejection by the old rules: its application went to Rejected.
    await addApp("misread", `Misreadco ${tag}`, "Platform Engineer", "submitted");
    await db.rpc("transition_application", { p_application_id: apps.misread, p_to: "rejected", p_cause: "email:rejection" });
    await db.from("emails").insert({
      user_id: userId, message_id: `<${tag}-misread@mail.test>`, received_at: ago(90).toISOString(), from_addr: "no-reply@ashbyhq.com",
      subject: `Thanks for applying to Misreadco ${tag}!`,
      snippet: `Thanks for applying to our Platform Engineer role! If you're not selected to move forward, please know this doesn't reflect your experience.`,
      classification: "rejection", application_id: apps.misread, reason: "rules",
    });
    // A receipt naming "X & Y Labs" that couldn't be tied to the application saved as "X and Y Labs".
    await addApp("amp", `Ampco and Partners ${tag}`, "Backend Engineer", "submitted");
    await db.from("emails").insert({
      user_id: userId, message_id: `<${tag}-amp@mail.test>`, received_at: ago(60).toISOString(), from_addr: "noreply@talent.ampco.test",
      subject: `Thanks for your interest in Ampco & Partners ${tag}, Malik!`,
      snippet: `Thank you for taking the time to apply to Ampco & Partners ${tag}! We will reach out if your experience is a strong match.`,
      classification: "confirmation", application_id: null, reason: "Claude: a receipt",
    });

    const { counts } = await runTrackEmail({ ...deps(), readMail: async () => [] });
    expect(counts.rechecked).toBeGreaterThanOrEqual(2);
    expect(await status("misread")).toBe("confirmed");
    expect(await status("amp")).toBe("confirmed");
    const { data: fixed } = await db.from("emails").select("classification, application_id").eq("message_id", `<${tag}-amp@mail.test>`).single();
    expect(fixed).toEqual({ classification: "confirmation", application_id: apps.amp });
    expect(moved).toEqual(expect.arrayContaining([`<${tag}-misread@mail.test> -> ${RECEIVED_FOLDER}`, `<${tag}-amp@mail.test> -> ${RECEIVED_FOLDER}`]));
  });
});
