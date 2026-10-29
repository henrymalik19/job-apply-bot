import type { Db, Insert, Json, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `answer_bank` (one topic). */
export type Topic = Row<"answer_bank">;
/** A row of `answer_bank_variants`. */
export type Variant = Row<"answer_bank_variants">;
/** A new `application_questions` row (application id added on insert). */
export type NewQuestion = Omit<Insert<"application_questions">, "application_id">;

/** Every topic in the answer bank. */
export async function listTopics(db: Db): Promise<Topic[]> {
  return unwrap(await db.from("answer_bank").select("*").order("key"), "list topics");
}

/** Every known wording, keyed by normalized text. */
export async function listVariants(db: Db): Promise<Map<string, Variant>> {
  const rows: Variant[] = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrap(await db.from("answer_bank_variants").select("*").range(from, from + 999), "list variants");
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return new Map(rows.map((v) => [v.normalized_text, v]));
}

/** Creates a topic, or returns the existing one with the same key. */
export async function ensureTopic(
  db: Db,
  topic: Pick<Insert<"answer_bank">, "key" | "label" | "category" | "value_type">,
): Promise<Topic> {
  check(await db.from("answer_bank").upsert(topic, { onConflict: "key", ignoreDuplicates: true }), "ensure topic");
  return unwrap(await db.from("answer_bank").select("*").eq("key", topic.key).single(), "read topic");
}

/** Records a wording → topic mapping; an existing mapping is left alone. */
export async function insertVariant(db: Db, variant: Insert<"answer_bank_variants">): Promise<void> {
  check(
    await db.from("answer_bank_variants").upsert(variant, { onConflict: "normalized_text", ignoreDuplicates: true }),
    "insert variant",
  );
}

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
    board_token: string;
  };
};

/**
 * Open jobs scored at or above `minScore` under a criteria version, best first,
 * that have no application yet.
 */
export async function listPrepareCandidates(db: Db, criteriaVersionId: string, minScore: number, limit: number): Promise<PrepareCandidate[]> {
  const res = await db
    .from("matches")
    .select("id, score, jobs!inner(id, title, company_name, source, external_id, description_md, closed_at, companies!inner(board_token), applications(id))")
    .eq("criteria_version_id", criteriaVersionId)
    .eq("status", "scored")
    .gte("score", minScore)
    .is("jobs.closed_at", null)
    .order("score", { ascending: false })
    .order("id")
    .limit(500);
  if (res.error) unwrap(res, "list prepare candidates");
  type JobEmbed = Omit<PrepareCandidate["job"], "board_token"> & {
    companies: { board_token: string };
    applications: { id: string } | { id: string }[] | null;
  };
  return (res.data ?? [])
    .map((r) => ({ matchId: r.id, score: r.score ?? 0, job: r.jobs as unknown as JobEmbed }))
    .filter((c) => !c.job.applications || (Array.isArray(c.job.applications) && c.job.applications.length === 0))
    .slice(0, limit)
    .map(({ matchId, score, job }) => {
      const { companies, applications: _applications, ...rest } = job;
      return { matchId, score, job: { ...rest, board_token: companies.board_token } };
    });
}

/** Applications created since a moment (for the daily cap). */
export async function countApplicationsSince(db: Db, since: Date): Promise<number> {
  const res = await db.from("applications").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString());
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
  application: Pick<Insert<"applications">, "job_id" | "match_id" | "status" | "flags" | "apply_method" | "prepared_at" | "prepare_error">,
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
