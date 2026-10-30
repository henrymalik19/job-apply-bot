import type { Db, Insert, Json } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A new `application_questions` row (application id added on insert). */
export type NewQuestion = Omit<Insert<"application_questions">, "application_id">;

/** A matched job ready to prepare, with what the form fetch needs. */
export type PrepareCandidate = {
  matchId: string;
  score: number;
  job: {
    id: string;
    title: string;
    company_name: string;
    source: string;
    external_id: string;
    description_md: string | null;
    location: string | null;
    board_token: string;
  };
};

/**
 * A user's open jobs scored at or above `minScore`, best first, that have no
 * application yet (an application points back at the match it came from).
 */
export async function listPrepareCandidates(db: Db, userId: string, minScore: number, limit: number): Promise<PrepareCandidate[]> {
  const res = await db
    .from("matches")
    .select("id, score, applications(id), jobs!inner(id, title, company_name, source, external_id, description_md, location, closed_at, companies!inner(board_token))")
    .eq("user_id", userId)
    .eq("status", "scored")
    .gte("score", minScore)
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .order("id")
    .limit(500);
  if (res.error) unwrap(res, "list prepare candidates");
  type JobEmbed = Omit<PrepareCandidate["job"], "board_token"> & { companies: { board_token: string } };
  const none = (a: unknown) => a == null || (Array.isArray(a) && a.length === 0);
  return (res.data ?? [])
    .filter((r) => none(r.applications))
    .slice(0, limit)
    .map((r) => {
      const { companies, ...rest } = r.jobs as unknown as JobEmbed;
      return { matchId: r.id, score: r.score ?? 0, job: { ...rest, board_token: companies.board_token } };
    });
}

/** A user's applications created since a moment (for the daily cap). */
export async function countApplicationsSince(db: Db, userId: string, since: Date): Promise<number> {
  const res = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if (res.error) unwrap(res, "count applications");
  return res.count ?? 0;
}

/**
 * Creates an application with its questions. If the questions can't be saved
 * the application is removed again, so a job is never left half-prepared.
 *
 * @returns The new application's id.
 */
export async function insertApplication(
  db: Db,
  application: Pick<Insert<"applications">, "user_id" | "job_id" | "match_id" | "status" | "flags" | "apply_method" | "prepared_at" | "prepare_error">,
  questions: NewQuestion[],
): Promise<string> {
  const { id } = unwrap(await db.from("applications").insert(application).select("id").single(), "insert application");
  if (questions.length === 0) return id;
  const res = await db.from("application_questions").insert(questions.map((q) => ({ ...q, application_id: id })));
  if (res.error) {
    await db.from("applications").delete().eq("id", id);
    unwrap(res, "insert application questions");
  }
  return id;
}

/** JSON helper for jsonb columns. */
export const asJson = (value: unknown) => value as Json;

/** Records why part of preparing an application failed (e.g. the resume). */
export async function setPrepareError(db: Db, applicationId: string, error: string): Promise<void> {
  check(await db.from("applications").update({ prepare_error: error.slice(0, 500) }).eq("id", applicationId), "set prepare error");
}
