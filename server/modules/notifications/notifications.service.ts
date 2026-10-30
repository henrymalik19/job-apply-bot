import type { Db } from "@/server/db/types";
import { z } from "zod";
import { createSmtpSender, type SendEmail, type SmtpConfig } from "@/server/integrations/email/smtp";
import { blockingQuestions, listApplications } from "@/server/modules/applications/applications.service";
import { finishRun, startRun } from "@/server/modules/runs/runs.service";
import { getSetting } from "@/server/modules/settings/settings.service";
import { buildDigest, inQuietHours, isDue, NOTIFY_HEADER, NOTIFY_STATUSES, type NotifyItem } from "./digest";
import { lastSentAt, markNotified } from "./notifications.repository";

export * from "./digest";

const WORKER = "notify";

/** `settings.job_inbox`: the job-search mailbox (the password is the JOB_INBOX_PASSWORD variable). */
const inboxSchema = z.object({
  address: z.string().email(),
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().positive(),
});

/** `settings.notifications`. `to: null` sends to the job inbox itself. */
const notifySchema = z.object({
  to: z.string().email().nullable().default(null),
  quiet_start: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  quiet_end: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
  timezone: z.string().default("America/New_York"),
  min_interval_minutes: z.number().nonnegative().default(15),
});

/** What the notify worker needs. */
export type NotifyDeps = {
  db: Db;
  /** The job inbox's password (JOB_INBOX_PASSWORD). */
  password: string;
  /** Builds the sender; tests pass a fake. */
  createSender?: (config: SmtpConfig) => SendEmail;
  now?: Date;
  log?: (line: string) => void;
};

type Flag = { kind: string; excerpt: string };

const flagText = (f: Flag) =>
  f.kind === "ai_restriction" ? `the employer restricts AI use ("${f.excerpt}")` : `text aimed at AI tools ("${f.excerpt}")`;

/** Applications due a notification, as digest items. */
async function dueItems(db: Db): Promise<NotifyItem[]> {
  const apps = await listApplications(db, NOTIFY_STATUSES);
  return apps
    .filter((a) => isDue(a.status, a.notified_status))
    .map((a) => ({
      id: a.id,
      status: a.status as NotifyItem["status"],
      title: a.job.title,
      company: a.job.company_name,
      score: a.score,
      questions: a.status === "needs_input" ? blockingQuestions(a).map((q) => q.question) : [],
      flags: ((a.flags as Flag[] | null) ?? []).map(flagText),
      prepareError: a.status === "manual" ? a.prepare_error : null,
    }));
}

/**
 * Notify worker: emails one digest of applications that need attention (Needs
 * you, apply yourself, ready to review, interviews, offers), from the job
 * inbox to `notifications.to` (default: the inbox itself). Sends at most once
 * per `min_interval_minutes` and never in quiet hours; anything held back goes
 * in the next digest. Each run is a `worker_runs` row (worker `notify`).
 */
export async function runNotify(deps: NotifyDeps): Promise<{ counts: Record<string, number> }> {
  const { db, now = new Date(), log = () => {}, createSender = createSmtpSender } = deps;
  const runId = await startRun(db, WORKER, null);
  const counts: Record<string, number> = { due: 0, sent: 0 };
  try {
    const [inboxRaw, notifyRaw, appUrlRaw] = await Promise.all([
      getSetting(db, "job_inbox"),
      getSetting(db, "notifications"),
      getSetting(db, "app_url"),
    ]);
    const inbox = inboxSchema.parse(inboxRaw);
    const settings = notifySchema.parse(notifyRaw ?? {});
    const appUrl = z.string().url().parse(appUrlRaw);

    const items = await dueItems(db);
    counts.due = items.length;
    if (items.length === 0) {
      await finishRun(db, runId, { ok: true, counts });
      return { counts };
    }

    if (inQuietHours(now, { start: settings.quiet_start, end: settings.quiet_end, timezone: settings.timezone })) {
      log(`notify: ${items.length} waiting, quiet hours`);
      counts.held_quiet = 1;
      await finishRun(db, runId, { ok: true, counts });
      return { counts };
    }
    const last = await lastSentAt(db);
    if (last && now.getTime() - last.getTime() < settings.min_interval_minutes * 60_000) {
      log(`notify: ${items.length} waiting, last email was under ${settings.min_interval_minutes} minutes ago`);
      counts.held_interval = 1;
      await finishRun(db, runId, { ok: true, counts });
      return { counts };
    }

    const digest = buildDigest(items, appUrl);
    const send = createSender({ host: inbox.smtp_host, port: inbox.smtp_port, user: inbox.address, password: deps.password });
    await send({ from: `Job Search Autopilot <${inbox.address}>`, to: settings.to ?? inbox.address, ...digest, headers: { [NOTIFY_HEADER]: "notify" } });
    await markNotified(db, items);
    counts.sent = 1;
    counts.applications = items.length;
    log(`notify: sent "${digest.subject}"`);
    await finishRun(db, runId, { ok: true, counts });
    return { counts };
  } catch (err) {
    await finishRun(db, runId, { ok: false, counts, error: String((err as Error)?.message ?? err) }).catch(() => {});
    throw err;
  }
}
