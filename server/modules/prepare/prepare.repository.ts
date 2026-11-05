import type { Db, Insert, Json } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { EVIDENCE_BUCKET } from "@/server/modules/apply/apply.repository";
import { APPLY_RUNS_BUCKET } from "@/server/modules/apply/apply-runs";
import { RESUME_BUCKET } from "@/server/modules/resumes/resumes.repository";

/** A new `application_questions` row (application id added on insert). */
export type NewQuestion = Omit<Insert<"application_questions">, "application_id">;

/** A job's title, company and description, for redrafting an answer. */
export async function getJobPosting(db: Db, jobId: string): Promise<{ title: string; company_name: string; description_md: string | null } | null> {
  return unwrap(await db.from("jobs").select("title, company_name, description_md").eq("id", jobId).maybeSingle(), "read job posting");
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
    location: string | null;
    board_token: string;
    company_id: string | null;
  };
};

/**
 * A user's open jobs scored at or above `minScore`, best first, that have no
 * application yet (an application points back at the match it came from).
 */
export async function listPrepareCandidates(db: Db, userId: string, minScore: number, limit: number, skipCompanies: ReadonlySet<string> = new Set()): Promise<PrepareCandidate[]> {
  const res = await db
    .from("matches")
    .select("id, score, applications(id), jobs!inner(id, title, company_name, company_id, source, external_id, description_md, location, closed_at, companies!inner(board_token))")
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
    // Companies you can't apply to right now (their limit on applications reached).
    .filter((r) => !skipCompanies.has((r.jobs as unknown as { company_id: string | null }).company_id ?? ""))
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
  application: Pick<Insert<"applications">, "user_id" | "job_id" | "match_id" | "status" | "flags" | "apply_method" | "prepared_at" | "prepare_error" | "rules_version">,
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

/** The note prepare leaves when it couldn't read a site's form. */
export const noFormError = (source: string) => `no application form available from ${source}`;

/** Applications prepare left as "can't be filled" because it couldn't read their form, untouched since. */
export async function listNoFormApplications(
  db: Db,
  userId: string,
  sources: readonly string[],
): Promise<{ id: string; job: { id: string; source: string; external_id: string; board_token: string } }[]> {
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, prepare_error, jobs!inner(id, source, external_id, closed_at, companies!inner(board_token))")
      .eq("user_id", userId)
      .eq("status", "manual")
      .is("apply_note", null)
      .is("jobs.closed_at", null)
      .in("jobs.source", [...sources])
      .like("prepare_error", "no application form available from %")
      .limit(50),
    "list no-form applications",
  ) as unknown as { id: string; prepare_error: string; jobs: { id: string; source: string; external_id: string; companies: { board_token: string } } }[];
  return rows
    .filter((r) => r.prepare_error.startsWith(noFormError(r.jobs.source)))
    .map((r) => ({ id: r.id, job: { id: r.jobs.id, source: r.jobs.source, external_id: r.jobs.external_id, board_token: r.jobs.companies.board_token } }));
}

/**
 * Removes an application so prepare starts it over: its rows go with it (questions, resume, events, runner
 * records), and so do its files in storage (the resume PDF, screenshots, the runner's recordings), which
 * nothing else would remove.
 *
 * @throws When it can't be removed (an email linked to it keeps it); its files are left as they were.
 */
export async function deleteApplication(db: Db, applicationId: string): Promise<void> {
  const [resumes, evidence, runs] = await Promise.all([
    db.from("resumes").select("pdf_path").eq("application_id", applicationId),
    db.from("application_evidence_items").select("storage_path").eq("application_id", applicationId),
    db.from("apply_runs").select("folder, files").eq("application_id", applicationId),
  ]);
  const files: [string, string[]][] = [
    [RESUME_BUCKET, (unwrap(resumes, "read resume files") ?? []).map((r) => r.pdf_path).filter((p): p is string => !!p)],
    [EVIDENCE_BUCKET, (unwrap(evidence, "read evidence files") ?? []).map((e) => e.storage_path).filter((p): p is string => !!p)],
    [APPLY_RUNS_BUCKET, (unwrap(runs, "read runner files") ?? []).flatMap((r) => r.files.map((f) => `${r.folder}/${f}`))],
  ];
  check(await db.from("applications").delete().eq("id", applicationId), "delete application");
  for (const [bucket, paths] of files) {
    // Left behind if storage won't remove them: the application is gone either way.
    if (paths.length) await db.storage.from(bucket).remove(paths).catch(() => undefined);
  }
}

/**
 * Your applications in `statuses` whose posting is still open and that the runner isn't filling, with
 * their resume (null when none was made yet).
 */
export async function listResumeCandidates(
  db: Db,
  userId: string,
  statuses: readonly string[],
): Promise<{ id: string; status: string; resume: { content: unknown; updated_at: string } | null }[]> {
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, status, jobs!inner(closed_at), resumes(content, updated_at)")
      .eq("user_id", userId)
      .in("status", [...statuses])
      .is("apply_step", null)
      .is("jobs.closed_at", null),
    "list resume candidates",
  ) as unknown as { id: string; status: string; resumes: { content: unknown; updated_at: string }[] | { content: unknown; updated_at: string } | null }[];
  return rows.map((r) => ({ id: r.id, status: r.status, resume: Array.isArray(r.resumes) ? (r.resumes[0] ?? null) : r.resumes }));
}
