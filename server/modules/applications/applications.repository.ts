import type { Db, Json, Row, Update } from "@/server/db/types";
import { APP_STATUSES, CAUSE_PATTERN, NO_REPLY_DAYS, NO_REPLY_DAYS_CLOSED, type AppStatus } from "@/server/modules/applications/application-status";
import { check, unwrap } from "@/server/core/errors";

/** A row of `applications`. */
export type Application = Row<"applications">;

/** The database refused a status change that `status_transitions` does not allow. */
export class IllegalTransitionError extends Error {}

/**
 * Changes an application's status: the only way status ever changes. Allowed
 * moves live in `status_transitions`; the database rejects anything else (and
 * rejects raw UPDATEs of `applications.status`) and writes an `events` row.
 *
 * @param cause - `<actor>:<action>`, e.g. `user:approve` (see `CAUSE_PATTERN`).
 * @param detail - Optional JSON stored on the event.
 * @throws {@link IllegalTransitionError} when the move is not allowed.
 */
export async function transition(
  db: Db,
  applicationId: string,
  to: AppStatus,
  cause: string,
  detail?: Record<string, unknown>,
): Promise<Application> {
  if (!CAUSE_PATTERN.test(cause)) throw new Error(`invalid cause "${cause}"`);
  const { data, error } = await db.rpc("transition_application", {
    p_application_id: applicationId,
    p_to: to,
    p_cause: cause,
    p_detail: (detail ?? null) as Json,
  });
  if (error) {
    if (error.message.startsWith("illegal transition")) throw new IllegalTransitionError(error.message);
    throw new Error(`transition failed: ${error.message}`);
  }
  return data as Application;
}

/** Statuses an application has before it is submitted: the ones a closed posting expires. */
const BEFORE_SUBMIT: readonly AppStatus[] = ["queued", "needs_input", "manual", "approved"];

/**
 * Expires every user's not-yet-submitted applications whose posting has closed
 * (discovery sets `jobs.closed_at` when a job leaves its board). One the apply
 * runner is working on is left alone. Service-role client.
 *
 * @returns How many were expired.
 */
export async function expireClosedApplications(db: Db): Promise<number> {
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, jobs!inner(closed_at)")
      .in("status", [...BEFORE_SUBMIT])
      .is("apply_step", null)
      .not("jobs.closed_at", "is", null),
    "list applications of closed postings",
  );
  for (const row of rows) await transition(db, row.id, "expired", "system:posting_closed");
  return rows.length;
}

/** Number of a user's applications in each status (every status present, zero if none). */
export async function countByStatus(db: Db, userId: string): Promise<Record<AppStatus, number>> {
  const rows = unwrap(await db.from("applications").select("status").eq("user_id", userId), "count applications");
  const counts = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const row of rows) counts[row.status as AppStatus]++;
  return counts;
}

/** The job fields application screens show. */
const JOB_COLUMNS = "id, title, company_name, company_id, location, remote_type, salary_min, salary_max, salary_currency, posted_at, url, apply_url, closed_at, source";

/** A job as application screens show it. */
export type ApplicationJob = Pick<
  Row<"jobs">,
  "id" | "title" | "company_name" | "company_id" | "location" | "remote_type" | "salary_min" | "salary_max" | "salary_currency" | "posted_at" | "url" | "apply_url" | "closed_at" | "source"
>;

/** A question row of an application. */
export type ApplicationQuestion = Row<"application_questions">;

/** One application with its job, score and questions. */
export type ApplicationWithDetails = Application & {
  job: ApplicationJob;
  score: number | null;
  questions: ApplicationQuestion[];
};

type Joined = Application & {
  jobs: ApplicationJob;
  matches: { score: number | null } | null;
  application_questions: ApplicationQuestion[];
};

const toDetails = ({ jobs, matches, application_questions, ...app }: Joined): ApplicationWithDetails => ({
  ...app,
  job: jobs,
  score: matches?.score ?? null,
  questions: [...application_questions].sort((a, b) => a.sort_order - b.sort_order),
});

/** A user's applications in some statuses, best score first, with their questions. */
export async function listApplications(db: Db, userId: string, statuses: readonly AppStatus[]): Promise<ApplicationWithDetails[]> {
  const rows = unwrap(
    await db
      .from("applications")
      .select(`*, jobs!inner(${JOB_COLUMNS}), matches(score), application_questions(*)`)
      .eq("user_id", userId)
      .in("status", [...statuses])
      .order("created_at", { ascending: false }),
    "list applications",
  );
  return (rows as unknown as Joined[]).map(toDetails).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * One of a user's applications with its job, score and questions, or null.
 *
 * @param fresh - Read it again even within the same page render (Next.js otherwise hands back the
 *   first identical read): after the render itself changed it.
 */
export async function getApplication(db: Db, userId: string, id: string, opts: { fresh?: boolean } = {}): Promise<ApplicationWithDetails | null> {
  let query = db
    .from("applications")
    .select(`*, jobs!inner(${JOB_COLUMNS}), matches(score), application_questions(*)`)
    .eq("user_id", userId)
    .eq("id", id);
  // A read with its own abort signal isn't shared with an earlier identical one.
  if (opts.fresh) query = query.abortSignal(new AbortController().signal);
  const res = await query.maybeSingle();
  if (res.error) unwrap(res, "get application");
  return res.data ? toDetails(res.data as unknown as Joined) : null;
}

/** Updates one question row of an application. */
export async function updateQuestion(
  db: Db,
  id: string,
  changes: Pick<Update<"application_questions">, "answer" | "answer_value" | "bucket" | "answer_source" | "user_approved" | "needs_check" | "reason" | "question_id">,
): Promise<void> {
  check(await db.from("application_questions").update(changes).eq("id", id), "update application question");
}

/** An answer marked to double-check on one of a user's applications, with the catalog question it was matched to. */
export type FlaggedAnswer = { id: string; question: string; question_id: string; application_id: string };

/**
 * Answers marked to double-check on a user's applications in some statuses that came straight from a matched
 * catalog question: not drafted, not yours, and not an AI judgment (a qualification or a picked option, which
 * carry a reason).
 */
export async function listMatchedChecks(db: Db, userId: string, statuses: readonly AppStatus[]): Promise<FlaggedAnswer[]> {
  const rows = unwrap(
    await db
      .from("application_questions")
      .select("id, question, question_id, application_id, applications!inner(user_id, status)")
      .eq("applications.user_id", userId)
      .in("applications.status", [...statuses])
      .eq("needs_check", true)
      .eq("bucket", "auto")
      .is("reason", null)
      .not("question_id", "is", null)
      .not("answer_source", "in", "(drafted,user)"),
    "list answers to double-check",
  );
  return rows.map((r) => ({ id: r.id, question: r.question, question_id: r.question_id!, application_id: r.application_id }));
}

/** Marks answers checked. */
export async function markChecked(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  check(await db.from("application_questions").update({ needs_check: false }).in("id", ids), "mark answers checked");
}

/** An unanswered question on one of a user's waiting applications, with its application. */
export type OpenQuestion = ApplicationQuestion & { applications: { id: string; status: string } };

/** Questions still waiting for an answer (`needs_user`) on a user's applications in some statuses. */
export async function listOpenQuestions(db: Db, userId: string, statuses: readonly AppStatus[]): Promise<OpenQuestion[]> {
  const rows = unwrap(
    await db
      .from("application_questions")
      .select("*, applications!inner(id, status, user_id)")
      .eq("applications.user_id", userId)
      .in("applications.status", [...statuses])
      .eq("bucket", "needs_user"),
    "list open questions",
  );
  return rows as unknown as OpenQuestion[];
}

/** Every allowed status move, as from → the statuses it can go to. */
export async function listTransitions(db: Db): Promise<Record<string, string[]>> {
  const rows = unwrap(await db.from("application_status_transitions").select("from_status, to_status"), "list transitions");
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.from_status] ??= []).push(r.to_status);
  return out;
}

/**
 * Moves submitted applications that heard nothing to No reply: no status change for
 * `user_settings.no_reply_days` (default {@link NO_REPLY_DAYS}), or {@link NO_REPLY_DAYS_CLOSED} once the
 * posting closed. Every user's (service role); a reply that comes later still moves them on.
 *
 * @returns How many were moved.
 */
export async function markNoReply(db: Db, now: Date): Promise<number> {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, user_id, last_status_at, jobs!inner(closed_at)")
      .in("status", ["submitted", "confirmed"])
      .lt("last_status_at", before(Math.min(NO_REPLY_DAYS, NO_REPLY_DAYS_CLOSED))),
    "list quiet applications",
  ) as unknown as { id: string; user_id: string; last_status_at: string; jobs: { closed_at: string | null } }[];
  if (rows.length === 0) return 0;
  const settings = unwrap(
    await db.from("user_settings").select("user_id, value").eq("key", "no_reply_days").in("user_id", [...new Set(rows.map((r) => r.user_id))]),
    "read no-reply days",
  );
  const daysFor = new Map(settings.map((s) => [s.user_id, Number(s.value)]));
  let moved = 0;
  for (const r of rows) {
    const set = daysFor.get(r.user_id);
    const days = r.jobs.closed_at ? NO_REPLY_DAYS_CLOSED : Number.isFinite(set) && set! > 0 ? set! : NO_REPLY_DAYS;
    if (r.last_status_at >= before(days)) continue;
    await transition(db, r.id, "no_reply", "system:no_reply", { days });
    moved++;
  }
  return moved;
}
