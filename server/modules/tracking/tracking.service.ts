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
import { markRead, mergeFolder, moveToFolder, readInbox, type InboxConfig, type InboxMail } from "@/server/integrations/email/inbox";
import { applicationHref, notify, type NotificationKind } from "@/server/modules/notifications/in-app";
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
  companyKey,
  senderNames,
  type EmailKind,
  type TrackedApp,
} from "./classify";

const WORKER = "track_email";
/** How far back the first run reads. */
const FIRST_RUN_DAYS = 14;
/** Unsorted emails ("other") not linked to an application are forgotten after this many days. */
export const FORGET_OTHER_DAYS = 30;
/** Any other email not linked to an application (shown under Needs sorting for 60 days) after this many. */
export const FORGET_UNLINKED_DAYS = 60;
/** Emails about an application you're told about in the app (a receipt isn't news). */
const TELL: Partial<Record<EmailKind, { kind: NotificationKind; title: (app: TrackedApp) => string }>> = {
  interview: { kind: "interview", title: (a) => `Interview invite: ${a.title} at ${a.company}` },
  recruiter: { kind: "reply", title: (a) => `${a.company} replied about ${a.title}` },
  rejection: { kind: "rejection", title: (a) => `${a.company} passed on ${a.title}` },
};
/** Kinds the rules find that Claude confirms before an application moves: getting one wrong costs the most. */
const CONFIRM_KINDS = new Set<EmailKind>(["rejection", "interview"]);
/** Kinds of email marked read once tied to an application: they need nothing from you. */
const READ_KINDS = new Set<EmailKind>(["confirmation", "rejection"]);
/** Where a matched rejection is filed (never deleted). */
export const REJECTIONS_FOLDER = "Jobrx/Rejected";
/** Where a matched application receipt is filed (never deleted). */
export const RECEIVED_FOLDER = "Jobrx/Received";
/** Where rejections were filed before; its mail is moved into {@link REJECTIONS_FOLDER} once. */
const OLD_REJECTIONS_FOLDER = "Rejections (Autopilot)";
/** The folder each kind of matched email is filed in, out of the inbox; the rest stay there. */
const FILE_IN: Partial<Record<EmailKind, string>> = { confirmation: RECEIVED_FOLDER, rejection: REJECTIONS_FOLDER };

/** The kinds that move an application, and where to. */
export const MOVES: Partial<Record<EmailKind, AppStatus>> = {
  confirmation: "confirmed",
  rejection: "rejected",
  interview: "interviewing",
  recruiter: "responded",
};
/** Statuses an email can be about: approved onwards (one you applied to by hand counts too). */
const TRACKED: readonly AppStatus[] = ["approved", "manual", "submitted", "confirmed", "responded", "interviewing", "offer", "no_reply"];

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
  /** Marks an email read in the inbox. */
  markMailRead?: (config: InboxConfig, messageId: string) => Promise<boolean>;
  /** Moves an old folder's mail into a new one and removes the old folder. */
  mergeMail?: (config: InboxConfig, from: string, folder: string) => Promise<number>;
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
  /** Old emails not linked to an application, forgotten this run. */
  forgotten?: number;
  /** Confirmations and rejections tied to an application, marked read (they need nothing from you). */
  marked_read?: number;
  /** Recent emails the rules once read wrongly or couldn't place, corrected. */
  rechecked?: number;
};

/**
 * Forgets emails no application needs: unsorted ones after {@link FORGET_OTHER_DAYS} days, any other
 * unlinked one after {@link FORGET_UNLINKED_DAYS}. Reading never goes back that far (it starts just
 * before the newest saved email, or {@link FIRST_RUN_DAYS} back), so none is read again. Emails linked
 * to an application are its history and stay.
 *
 * @returns How many were forgotten.
 */
export async function forgetOldEmails(db: Db, userId: string, now: Date): Promise<number> {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const other = unwrap(
    await db.from("emails").delete().eq("user_id", userId).is("application_id", null).eq("classification", "other").lt("received_at", before(FORGET_OTHER_DAYS)).select("id"),
    "forget old unsorted emails",
  );
  const unlinked = unwrap(
    await db.from("emails").delete().eq("user_id", userId).is("application_id", null).lt("received_at", before(FORGET_UNLINKED_DAYS)).select("id"),
    "forget old unlinked emails",
  );
  return other.length + unlinked.length;
}

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
 * Emails saved as "other" in the last two weeks that today's rules can place (a rule added since,
 * or saved while there was no Claude to sort it) are forgotten, so this run reads them again in full.
 *
 * @returns Where reading starts: `since`, or earlier to reach those emails.
 */
async function retryUnsorted(db: Db, userId: string, since: Date, now: Date): Promise<Date> {
  const rows = unwrap(
    await db
      .from("emails")
      .select("id, received_at, from_addr, subject, snippet")
      .eq("user_id", userId)
      .eq("classification", "other")
      .is("application_id", null)
      .gte("received_at", new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000).toISOString()),
    "list unsorted emails",
  );
  const placeable = rows.filter((r) => {
    const fromAddress = /<([^>]+)>/.exec(r.from_addr ?? "")?.[1] ?? r.from_addr ?? "";
    return classifyByRules({ fromAddress, fromName: "", subject: r.subject ?? "", text: r.snippet ?? "" }) != null;
  });
  if (placeable.length === 0) return since;
  check(await db.from("emails").delete().in("id", placeable.map((r) => r.id)), "forget unsorted emails");
  const oldest = Math.min(...placeable.map((r) => new Date(r.received_at).getTime())) - 3600_000;
  return new Date(Math.min(since.getTime(), oldest));
}

/**
 * Runs email tracking once for one user.
 *
 * @throws Only when the run itself can't proceed (no inbox setting, the inbox or database unreachable).
 */
export async function runTrackEmail(deps: TrackDeps): Promise<{ counts: TrackCounts }> {
  const { db, userId, now = () => new Date(), log = () => {}, readMail = readInbox, moveMail = moveToFolder, markMailRead = markRead, mergeMail = mergeFolder } = deps;
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
    counts.forgotten = await forgetOldEmails(db, userId, now());
    const config: InboxConfig = { host: inbox.imap_host, port: inbox.imap_port, user: inbox.address, password: deps.password };
    // Rejections filed in the old folder join the new one (once; after that the old folder is gone).
    await mergeMail(config, OLD_REJECTIONS_FOLDER, REJECTIONS_FOLDER).catch((err) => log(`track_email: couldn't move the old rejections folder: ${(err as Error).message}`));
    const [mails, apps, transitions, budget] = await Promise.all([
      readSince(db, userId, now())
        .then((since) => retryUnsorted(db, userId, since, now()))
        .then((since) => readMail(config, since)),
      listApplications(db, userId, TRACKED),
      listTransitions(db),
      getMonthlySpend(db, userId, now()),
    ]);
    counts.read = mails.length;
    const seen = await seenIds(db, userId, mails.map((m) => m.messageId));
    const otherNames = await listOtherNames(db, apps.map((a) => a.job.company_id));
    const tracked: TrackedApp[] = apps.map((a) => ({
      id: a.id, status: a.status, company: a.job.company_name, title: a.job.title, submittedAt: a.submitted_at,
      otherNames: otherNames.get(a.job.company_id ?? "") ?? [],
    }));
    const byId = new Map(tracked.map((a) => [a.id, a]));

    /**
     * Marks a receipt or a rejection read and files it out of the inbox, so what's left there is what needs
     * you (an interview, a recruiter, one it couldn't place stay unread). Returns whether it was filed.
     */
    const fileMail = async (messageId: string, kind: EmailKind, company: string): Promise<boolean> => {
      if (READ_KINDS.has(kind)) {
        try {
          if (await markMailRead(config, messageId)) counts.marked_read = (counts.marked_read ?? 0) + 1;
        } catch (err) {
          log(`track_email: couldn't mark the ${kind} from ${company} read: ${(err as Error).message}`);
        }
      }
      const folder = FILE_IN[kind];
      if (!folder) return false;
      try {
        if (await moveMail(config, messageId, folder)) {
          counts.archived++;
          return true;
        }
      } catch (err) {
        log(`track_email: couldn't file the ${kind} from ${company} in ${folder}: ${(err as Error).message}`);
      }
      return false;
    };

    // Recent emails the rules once read wrongly or couldn't tie to an application, corrected.
    counts.rechecked = await reconsiderRecent(db, userId, tracked, transitions, now(), fileMail, log).catch((err) => {
      log(`track_email: recheck failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    });
    let spent = budget.spent;

    for (const mail of mails) {
      if (seen.has(mail.messageId)) continue;
      // The digest this app sends to the same inbox.
      if (mail.headers[NOTIFY_HEADER.toLowerCase()]) continue;
      const match = matchEmail(mail, tracked);
      let kind = classifyByRules(mail);
      let reason = kind ? "rules" : "";
      // A rejection or an interview moves an application (and a rejection leaves the inbox): Claude reads
      // the whole email to confirm one before it does, since a receipt can word things like either.
      const confirm = kind != null && CONFIRM_KINDS.has(kind) && match.app != null;
      if ((!kind && (match.app || fromAts(mail))) || confirm) {
        const ruled = kind;
        if (!deps.call) {
          kind ??= "other";
          reason = ruled ? "rules (no Claude to confirm)" : "no Claude to sort it";
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
          kind = res.output?.kind ?? (ruled && !CONFIRM_KINDS.has(ruled) ? ruled : "other");
          reason = [res.output ? `Claude: ${res.output.reason}` : `Claude failed: ${res.error ?? "no answer"}`, ruled && ruled !== kind ? `rules said ${ruled}` : ""]
            .filter(Boolean)
            .join("; ");
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
        await notify(db, userId, {
          kind: "email_to_sort",
          title: match.app ? `An email that may be about ${match.app.company}` : "An email about an application to sort",
          body: `"${mail.subject}": tracking couldn't tie it to an application for sure. Link it on To do.`,
          href: "/app/todo?tab=emails",
          dedupeKey: `email:${mail.messageId}`,
        });
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
      const told = TELL[kind];
      if (told) {
        await notify(db, userId, {
          kind: told.kind, title: told.title(app), body: mail.subject, href: applicationHref(app.id), applicationId: app.id,
          dedupeKey: `email:${mail.messageId}`,
        });
      }
      // A receipt or a no, tied to its application, needs nothing from you: read. Anything that might
      // (an interview, a recruiter, one it couldn't place) stays unread so it stands out.
      if (await fileMail(mail.messageId, kind, app.company)) await db.from("emails").update({ archived_at: now().toISOString() }).eq("id", row.id);
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
  return rows.map(toView);
}

const DISMISSED = "not about an application (you said)";
const toView = (r: { id: string; received_at: string; from_addr: string | null; subject: string | null; snippet: string | null; classification: string | null; reason: string | null }): UnmatchedEmail => ({
  id: r.id,
  receivedAt: r.received_at,
  from: r.from_addr ?? "",
  subject: r.subject ?? "",
  snippet: r.snippet ?? "",
  kind: (r.classification ?? "other") as EmailKind,
  reason: r.reason,
});
/** The address in "Name <address>", or the whole string. */
const addressOf = (from: string) => /<([^>]+)>/.exec(from)?.[1] ?? from;

/**
 * Emails tracking couldn't sort (saved as "other") that look like they're about an application:
 * from an ATS, or naming a company you applied to. Last 30 days, newest first; ones you dismissed
 * are left out.
 */
export async function listUnsortedEmails(db: Db, userId: string, apps: TrackedApp[], now = new Date()): Promise<UnmatchedEmail[]> {
  const rows = unwrap(
    await db
      .from("emails")
      .select("id, received_at, from_addr, subject, snippet, classification, reason")
      .eq("user_id", userId)
      .is("application_id", null)
      .eq("classification", "other")
      .gte("received_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
      .order("received_at", { ascending: false }),
    "list unsorted emails",
  );
  return rows
    .filter((r) => r.reason !== DISMISSED)
    .filter((r) => {
      const mail = { fromAddress: addressOf(r.from_addr ?? ""), fromName: r.from_addr ?? "", subject: r.subject ?? "", text: r.snippet ?? "" };
      return fromAts(mail) || matchEmail({ ...mail, receivedAt: new Date(r.received_at) }, apps).app != null;
    })
    .map(toView);
}

/** The emails tied to one application, newest first. */
export async function listApplicationEmails(db: Db, userId: string, applicationId: string): Promise<UnmatchedEmail[]> {
  const rows = unwrap(
    await db
      .from("emails")
      .select("id, received_at, from_addr, subject, snippet, classification, reason")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("received_at", { ascending: false }),
    "list application emails",
  );
  return rows.map(toView);
}

/**
 * Links an email to one of your applications and moves it as tracking would have (a
 * confirmation is kept as evidence). For an email tracking couldn't sort, `kind` says what
 * it is. It stays in the inbox: the web app doesn't reach the mailbox.
 *
 * @throws {@link ValidationError} when the email or the application isn't yours, or the kind doesn't move one.
 */
export async function linkEmail(db: Db, userId: string, emailId: string, applicationId: string, kind?: EmailKind): Promise<AppStatus | null> {
  if (kind && !(kind in MOVES)) throw new ValidationError("Pick what the email says.");
  const email = unwrap(
    await db.from("emails").select("id, message_id, subject, snippet, classification, received_at, from_addr").eq("user_id", userId).eq("id", emailId).maybeSingle(),
    "get email",
  );
  if (!email) throw new ValidationError("That email is gone.");
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new ValidationError("That application is gone.");
  const said = kind ?? (email.classification as EmailKind);
  if (!(said in MOVES)) throw new ValidationError("Pick what the email says.");
  check(
    await db.from("emails").update({ application_id: app.id, match_confidence: 1, classification: said, reason: "linked by you" }).eq("id", email.id),
    "link email",
  );
  if (said === "confirmation") {
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
  await rememberOtherNames(db, app.job.company_id, app.job.company_name, email.from_addr ?? "");
  return moveForEmail(db, app, said, { email_id: email.id, subject: (email.subject ?? "").slice(0, 200), linked_by: "user" }, await listTransitions(db));
}

/** Other names companies' email comes under, by company id (only companies that have any). */
async function listOtherNames(db: Db, companyIds: (string | null)[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(companyIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const rows = unwrap(await db.from("companies").select("id, other_names").in("id", ids), "read company names");
  return new Map(rows.filter((r) => r.other_names.length > 0).map((r) => [r.id, r.other_names]));
}

/**
 * An email you linked by hand came under a name the company isn't known by (Oneapp's mail as Onepay): its
 * sender's names are remembered for the company, so its next emails match on their own.
 */
async function rememberOtherNames(db: Db, companyId: string | null, company: string, from: string): Promise<void> {
  if (!companyId) return;
  const known = unwrap(await db.from("companies").select("other_names").eq("id", companyId).single(), "read company names").other_names;
  const keys = new Set([company, ...known].map(companyKey));
  const fresh = senderNames(from).filter((n) => {
    const key = companyKey(n);
    // A name that contains the company's ("Vanta Recruiting" for Vanta) adds nothing.
    return key && ![...keys].some((k) => k && (key === k || ` ${key} `.includes(` ${k} `)));
  });
  if (fresh.length === 0) return;
  check(await db.from("companies").update({ other_names: [...known, ...fresh] }).eq("id", companyId), "remember company names");
}

/** Marks an unmatched email as not about any application, so it leaves the list. */
export async function dismissEmail(db: Db, userId: string, emailId: string): Promise<void> {
  check(
    await db.from("emails").update({ classification: "other", reason: DISMISSED }).eq("user_id", userId).eq("id", emailId),
    "dismiss email",
  );
}

/**
 * Looks again at the last {@link FIRST_RUN_DAYS} days of saved emails with today's rules and matching (no
 * Claude): one the rules once read wrongly (a receipt taken for a rejection) or couldn't tie to an
 * application ("Hims and Hers" against "Hims & Hers") is corrected, its application moved and the email
 * filed. Emails Claude sorted, ones you dismissed, and rejections or interviews (which only Claude may
 * confirm) are left alone.
 *
 * @returns How many were corrected.
 */
async function reconsiderRecent(
  db: Db,
  userId: string,
  tracked: TrackedApp[],
  transitions: Record<string, string[]>,
  now: Date,
  file: (messageId: string, kind: EmailKind, company: string) => Promise<boolean>,
  log: (line: string) => void,
): Promise<number> {
  const rows = unwrap(
    await db
      .from("emails")
      .select("id, message_id, from_addr, subject, snippet, classification, application_id, reason, received_at")
      .eq("user_id", userId)
      .gte("received_at", new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000).toISOString()),
    "list recent emails",
  );
  const linkedIds = [...new Set(rows.map((r) => r.application_id).filter((id): id is string => !!id))];
  // A linked application may have moved somewhere tracking doesn't follow (Rejected, by a misread).
  const linked = linkedIds.length
    ? unwrap(await db.from("applications").select("id, status, jobs!inner(title, company_name)").in("id", linkedIds), "read linked applications")
    : [];
  const linkedApps = new Map(
    (linked as unknown as { id: string; status: string; jobs: { title: string; company_name: string } }[]).map((a) => [a.id, { id: a.id, status: a.status, company: a.jobs.company_name }]),
  );

  let corrected = 0;
  for (const r of rows) {
    if (r.reason === DISMISSED) continue;
    const fromAddress = /<([^>]+)>/.exec(r.from_addr ?? "")?.[1] ?? r.from_addr ?? "";
    const mail = { fromAddress, fromName: "", subject: r.subject ?? "", text: r.snippet ?? "", receivedAt: new Date(r.received_at) };
    // An unmatched email the rules can't read keeps how it was sorted (by Claude, say): only its match is new.
    const kind = classifyByRules(mail) ?? (!r.application_id && r.classification && r.classification in MOVES ? (r.classification as EmailKind) : null);
    // Only what the rules settle alone; a rejection or an interview is Claude's to confirm.
    if (!kind || !(kind in MOVES) || CONFIRM_KINDS.has(kind)) continue;
    let app: { id: string; status: string; company: string } | undefined;
    if (r.application_id) {
      // Linked already: corrected only when the rules read it differently now, and it was the rules' call.
      if (kind === r.classification || !(r.reason ?? "").startsWith("rules")) continue;
      app = linkedApps.get(r.application_id);
    } else {
      if (r.classification !== "other" && !(r.classification && r.classification in MOVES)) continue;
      const match = matchEmail(mail, tracked);
      if (!match.app || match.confidence < MATCH_THRESHOLD) continue;
      app = match.app;
    }
    if (!app) continue;
    check(
      await db.from("emails").update({ classification: kind, application_id: app.id, reason: `rules (rechecked; was ${r.classification ?? "unsorted"})` }).eq("id", r.id),
      "correct email",
    );
    const moved = await moveForEmail(db, app, kind, { email_id: r.id, subject: (r.subject ?? "").slice(0, 200), rechecked: true }, transitions);
    if (moved) {
      app.status = moved;
      log(`track_email: rechecked "${r.subject}": ${app.company} -> ${moved}`);
    }
    if (await file(r.message_id, kind, app.company)) check(await db.from("emails").update({ archived_at: now.toISOString() }).eq("id", r.id), "file email");
    corrected++;
  }
  return corrected;
}
