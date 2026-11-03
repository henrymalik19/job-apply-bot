// Email tracking (track_email): reads the job inbox, sorts each new email, finds
// the application it's about and moves it: a confirmation to Confirmed (kept as
// evidence), a rejection to Rejected, an interview invite to Interviewing, a
// recruiter's reply to Heard back. A matched rejection is moved out of the inbox
// into its own folder, never deleted. Emails it can't match wait on To do for you
// to link. Each run is a worker_runs row (worker "track_email").
import { z } from "zod";
import type { Db, Json } from "@/server/db/types";
import { check, unwrap, ValidationError } from "@/server/core/errors";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { moveToFolder, readInbox, type InboxConfig, type InboxMail } from "@/server/integrations/email/inbox";
import { getApplication, listApplications, listTransitions, transition, type AppStatus } from "@/server/modules/applications/applications.service";
import { NOTIFY_HEADER } from "@/server/modules/notifications/digest";
import { finishRun, startRun } from "@/server/modules/runs/runs.service";
import { getUserSetting } from "@/server/modules/settings/settings.service";
import { getMonthlySpend, recordUsage } from "@/server/modules/usage/usage.service";
import {
  buildClassifyPrompt,
  classifyByRules,
  emailKindSchema,
  fromAts,
  matchEmail,
  MATCH_THRESHOLD,
  type EmailKind,
  type TrackedApp,
} from "./classify";

const WORKER = "track_email";
/** How far back the first run reads. */
const FIRST_RUN_DAYS = 14;
/** Where a matched rejection is moved (never deleted). */
export const REJECTIONS_FOLDER = "Rejections (Autopilot)";

/** The kinds that move an application, and where to. */
const MOVES: Partial<Record<EmailKind, AppStatus>> = {
  confirmation: "confirmed",
  rejection: "rejected",
  interview: "interviewing",
  recruiter: "responded",
};
/** Statuses an email can be about: approved onwards (one you applied to by hand counts too). */
const TRACKED: readonly AppStatus[] = ["approved", "manual", "submitted", "confirmed", "responded", "interviewing", "offer"];

/** `user_settings.job_inbox`; IMAP defaults to Purelymail. */
const inboxSchema = z.object({
  address: z.string().email(),
  imap_host: z.string().min(1).default("imap.purelymail.com"),
  imap_port: z.number().int().positive().default(993),
});

/** What a tracking run needs; tests pass a fake inbox and Claude. */
export type TrackDeps = {
  db: Db;
  userId: string;
  /** The job inbox's password (JOB_INBOX_PASSWORD). */
  password: string;
  /** Claude, for emails the rules can't sort; without it they're "other". */
  call?: StructuredCall;
  readMail?: (config: InboxConfig, since: Date) => Promise<InboxMail[]>;
  moveMail?: (config: InboxConfig, messageId: string, folder: string) => Promise<boolean>;
  now?: () => Date;
  log?: (line: string) => void;
};

/** What one run did. */
export type TrackCounts = {
  read: number;
  new: number;
  matched: number;
  moved: number;
  unmatched: number;
  archived: number;
  deferred: number;
  cost_usd: number;
};

/**
 * Moves an application for an email about it: one still approved or "apply yourself"
 * is marked submitted first (the email shows it was sent), then moved where the
 * email says, when that's a move forward the board allows.
 *
 * @returns The status it moved to, or null when it stayed.
 */
export async function moveForEmail(
  db: Db,
  app: { id: string; status: string },
  kind: EmailKind,
  detail: Record<string, unknown>,
  transitions: Record<string, string[]>,
): Promise<AppStatus | null> {
  const target = MOVES[kind];
  if (!target) return null;
  let status = app.status;
  if ((status === "approved" || status === "manual") && transitions[status]?.includes("submitted")) {
    await transition(db, app.id, "submitted", "email:applied", detail);
    status = "submitted";
  }
  if (!transitions[status]?.includes(target)) return status === app.status ? null : "submitted";
  await transition(db, app.id, target, `email:${kind}`, detail);
  return target;
}

/** Keeps a confirmation email as evidence that the application was received. */
async function keepConfirmation(db: Db, applicationId: string, mail: InboxMail): Promise<void> {
  check(
    await db.from("application_evidence_items").insert({
      application_id: applicationId,
      kind: "confirmation_email",
      email_message_id: mail.messageId,
      text_excerpt: `${mail.subject}\n\n${mail.text}`.slice(0, 1000),
      detail: { from: mail.fromAddress, received_at: mail.receivedAt.toISOString() } as Json,
    }),
    "keep confirmation email",
  );
}

/** Message ids among `ids` already recorded for the user. */
async function seenIds(db: Db, userId: string, ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = unwrap(
      await db.from("emails").select("message_id").eq("user_id", userId).in("message_id", ids.slice(i, i + 100)),
      "list seen emails",
    );
    for (const r of rows) seen.add(r.message_id);
  }
  return seen;
}

/** Where reading starts: an hour before the newest email recorded, or two weeks back. */
async function readSince(db: Db, userId: string, now: Date): Promise<Date> {
  const rows = unwrap(
    await db.from("emails").select("received_at").eq("user_id", userId).order("received_at", { ascending: false }).limit(1),
    "newest email",
  );
  return rows[0] ? new Date(new Date(rows[0].received_at).getTime() - 3600_000) : new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000);
}

/**
 * Runs email tracking once for one user.
 *
 * @throws Only when the run itself can't proceed (no inbox setting, the inbox or database unreachable).
 */
export async function runTrackEmail(deps: TrackDeps): Promise<{ counts: TrackCounts }> {
  const { db, userId, now = () => new Date(), log = () => {}, readMail = readInbox, moveMail = moveToFolder } = deps;
  const runId = await startRun(db, WORKER, null, userId);
  const counts: TrackCounts = { read: 0, new: 0, matched: 0, moved: 0, unmatched: 0, archived: 0, deferred: 0, cost_usd: 0 };
  try {
    const inboxRaw = await getUserSetting(db, userId, "job_inbox");
    // A user without a job inbox has nothing to track.
    if (inboxRaw == null) {
      await finishRun(db, runId, { ok: true, counts });
      return { counts };
    }
    const inbox = inboxSchema.parse(inboxRaw);
    const config: InboxConfig = { host: inbox.imap_host, port: inbox.imap_port, user: inbox.address, password: deps.password };
    const [mails, apps, transitions, budget] = await Promise.all([
      readSince(db, userId, now()).then((since) => readMail(config, since)),
      listApplications(db, userId, TRACKED),
      listTransitions(db),
      getMonthlySpend(db, userId, now()),
    ]);
    counts.read = mails.length;
    const seen = await seenIds(db, userId, mails.map((m) => m.messageId));
    const tracked: TrackedApp[] = apps.map((a) => ({ id: a.id, status: a.status, company: a.job.company_name, title: a.job.title, submittedAt: a.submitted_at }));
    const byId = new Map(tracked.map((a) => [a.id, a]));
    let spent = budget.spent;

    for (const mail of mails) {
      if (seen.has(mail.messageId)) continue;
      // The digest this app sends to the same inbox.
      if (mail.headers[NOTIFY_HEADER.toLowerCase()]) continue;
      const match = matchEmail(mail, tracked);
      let kind = classifyByRules(mail);
      let reason = kind ? "rules" : "";
      if (!kind && (match.app || fromAts(mail))) {
        if (!deps.call) {
          kind = "other";
          reason = "no Claude to sort it";
        } else if (spent >= budget.cap) {
          // Left unread so a later run sorts it once the month's budget allows.
          counts.deferred++;
          continue;
        } else {
          const prompt = buildClassifyPrompt(mail, match.app?.company ?? "a company you applied to");
          const res = await deps.call({ ...prompt, schema: emailKindSchema, maxTokens: 400, effort: "low" });
          const cost = await recordUsage(db, userId, { purpose: "track_email", model: res.model, usage: res.usage });
          spent += cost;
          counts.cost_usd += cost;
          kind = res.output?.kind ?? "other";
          reason = res.output ? `Claude: ${res.output.reason}` : `Claude failed: ${res.error ?? "no answer"}`;
        }
      }
      kind ??= "other";

      const relevant = kind in MOVES;
      const confident = relevant && match.app != null && match.confidence >= MATCH_THRESHOLD;
      const { data: row, error } = await db
        .from("emails")
        .insert({
          user_id: userId,
          message_id: mail.messageId,
          received_at: mail.receivedAt.toISOString(),
          from_addr: mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress,
          subject: mail.subject.slice(0, 500),
          snippet: mail.text.replace(/\s+/g, " ").trim().slice(0, 500),
          classification: kind,
          application_id: confident ? match.app!.id : null,
          match_confidence: relevant && match.app ? match.confidence : null,
          reason: [reason, relevant ? match.reason : null].filter(Boolean).join("; ").slice(0, 500),
        })
        .select("id")
        .single();
      if (error) throw new Error(`record email: ${error.message}`);
      counts.new++;
      if (!relevant) continue;
      if (!confident) {
        counts.unmatched++;
        continue;
      }

      counts.matched++;
      const app = byId.get(match.app!.id)!;
      if (kind === "confirmation") await keepConfirmation(db, app.id, mail);
      const moved = await moveForEmail(db, app, kind, { email_id: row.id, subject: mail.subject.slice(0, 200) }, transitions);
      if (moved) {
        counts.moved++;
        app.status = moved;
        log(`track_email: ${app.company} -> ${moved} (${kind}: "${mail.subject}")`);
      }
      if (kind === "rejection") {
        try {
          if (await moveMail(config, mail.messageId, REJECTIONS_FOLDER)) {
            await db.from("emails").update({ archived_at: now().toISOString() }).eq("id", row.id);
            counts.archived++;
          }
        } catch (err) {
          log(`track_email: couldn't move the rejection from ${app.company} out of the inbox: ${(err as Error).message}`);
        }
      }
    }
    counts.cost_usd = Math.round(counts.cost_usd * 10000) / 10000;
    await finishRun(db, runId, { ok: true, counts });
    return { counts };
  } catch (err) {
    await finishRun(db, runId, { ok: false, counts, error: String((err as Error)?.message ?? err) }).catch(() => {});
    throw err;
  }
}

/** An email about an application that couldn't be matched to one. */
export type UnmatchedEmail = {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  snippet: string;
  kind: EmailKind;
  reason: string | null;
};

/** Emails that would move an application but couldn't be matched to one, newest first (last 60 days). */
export async function listUnmatchedEmails(db: Db, userId: string, now = new Date()): Promise<UnmatchedEmail[]> {
  const rows = unwrap(
    await db
      .from("emails")
      .select("id, received_at, from_addr, subject, snippet, classification, reason")
      .eq("user_id", userId)
      .is("application_id", null)
      .in("classification", Object.keys(MOVES))
      .gte("received_at", new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .order("received_at", { ascending: false }),
    "list unmatched emails",
  );
  return rows.map((r) => ({
    id: r.id,
    receivedAt: r.received_at,
    from: r.from_addr ?? "",
    subject: r.subject ?? "",
    snippet: r.snippet ?? "",
    kind: r.classification as EmailKind,
    reason: r.reason,
  }));
}

/**
 * Links an unmatched email to one of your applications and moves it as tracking would
 * have (a confirmation is kept as evidence). It stays in the inbox: the web app doesn't
 * reach the mailbox.
 *
 * @throws {@link ValidationError} when the email or the application isn't yours.
 */
export async function linkEmail(db: Db, userId: string, emailId: string, applicationId: string): Promise<AppStatus | null> {
  const email = unwrap(
    await db.from("emails").select("id, message_id, subject, snippet, classification, received_at, from_addr").eq("user_id", userId).eq("id", emailId).maybeSingle(),
    "get email",
  );
  if (!email) throw new ValidationError("That email is gone.");
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new ValidationError("That application is gone.");
  check(
    await db.from("emails").update({ application_id: app.id, match_confidence: 1, reason: "linked by you" }).eq("id", email.id),
    "link email",
  );
  const kind = email.classification as EmailKind;
  if (kind === "confirmation") {
    check(
      await db.from("application_evidence_items").insert({
        application_id: app.id,
        kind: "confirmation_email",
        email_message_id: email.message_id,
        text_excerpt: `${email.subject ?? ""}\n\n${email.snippet ?? ""}`.slice(0, 1000),
        detail: { from: email.from_addr, received_at: email.received_at, linked_by: "user" } as Json,
      }),
      "keep confirmation email",
    );
  }
  return moveForEmail(db, app, kind, { email_id: email.id, subject: (email.subject ?? "").slice(0, 200), linked_by: "user" }, await listTransitions(db));
}

/** Marks an unmatched email as not about any application, so it leaves the list. */
export async function dismissEmail(db: Db, userId: string, emailId: string): Promise<void> {
  check(
    await db.from("emails").update({ classification: "other", reason: "not about an application (you said)" }).eq("user_id", userId).eq("id", emailId),
    "dismiss email",
  );
}
