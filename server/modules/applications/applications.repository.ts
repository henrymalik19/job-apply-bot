import type { Db, Json, Row, Update } from "@/server/db/types";
import { APP_STATUSES, CAUSE_PATTERN, type AppStatus } from "@/server/modules/applications/application-status";
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

/** Number of a user's applications in each status (every status present, zero if none). */
export async function countByStatus(db: Db, userId: string): Promise<Record<AppStatus, number>> {
  const rows = unwrap(await db.from("applications").select("status").eq("user_id", userId), "count applications");
  const counts = Object.fromEntries(APP_STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const row of rows) counts[row.status as AppStatus]++;
  return counts;
}

/** The job fields application screens show. */
const JOB_COLUMNS = "id, title, company_name, location, remote_type, salary_min, salary_max, salary_currency, posted_at, url, apply_url, closed_at";

/** A job as application screens show it. */
export type ApplicationJob = Pick<
  Row<"jobs">,
  "id" | "title" | "company_name" | "location" | "remote_type" | "salary_min" | "salary_max" | "salary_currency" | "posted_at" | "url" | "apply_url" | "closed_at"
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

/** One of a user's applications with its job, score and questions, or null. */
export async function getApplication(db: Db, userId: string, id: string): Promise<ApplicationWithDetails | null> {
  const res = await db
    .from("applications")
    .select(`*, jobs!inner(${JOB_COLUMNS}), matches(score), application_questions(*)`)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
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
