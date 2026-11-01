import type { Db, Json, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { RESUME_BUCKET } from "@/server/modules/resumes/resumes.repository";

/** The private Storage bucket for evidence screenshots, one folder per user. */
export const EVIDENCE_BUCKET = "evidence";

/** Where the runner is with an application; null when idle. */
export type ApplyStep = "filling" | "waiting_for_you" | "submitting";

/** One platform's trust level for a user. */
export type Platform = Row<"platforms">;

/** An approved application as the runner needs it: job, board, questions and resume. */
export type ApplyJob = {
  id: string;
  user_id: string;
  job: { title: string; company_name: string; source: string; external_id: string; board_token: string | null };
  questions: Row<"application_questions">[];
  resume: { pdf_path: string | null; sha256: string | null } | null;
};

type Joined = Omit<ApplyJob, "job" | "questions" | "resume"> & {
  jobs: Omit<ApplyJob["job"], "board_token"> & { companies: { board_token: string } | null };
  application_questions: Row<"application_questions">[];
  resumes: { pdf_path: string | null; sha256: string | null }[] | { pdf_path: string | null; sha256: string | null } | null;
};

/** Approved applications on these ATSs that the runner hasn't started, oldest approval first. */
export async function listReadyToApply(db: Db, userId: string, ats: readonly string[]): Promise<ApplyJob[]> {
  const rows = unwrap(
    await db
      .from("applications")
      .select("id, user_id, jobs!inner(title, company_name, source, external_id, companies(board_token)), application_questions(*), resumes(pdf_path, sha256)")
      .eq("user_id", userId)
      .eq("status", "approved")
      .is("apply_step", null)
      .in("jobs.source", [...ats])
      .order("approved_at", { ascending: true }),
    "list applications ready to apply",
  ) as unknown as Joined[];
  return rows.map(({ jobs, application_questions, resumes, ...app }) => ({
    ...app,
    job: { title: jobs.title, company_name: jobs.company_name, source: jobs.source, external_id: jobs.external_id, board_token: jobs.companies?.board_token ?? null },
    questions: [...application_questions].sort((a, b) => a.sort_order - b.sort_order),
    resume: Array.isArray(resumes) ? (resumes[0] ?? null) : resumes,
  }));
}

/** Sets the runner's progress on an application (null step = idle). */
export async function setApplyStep(db: Db, applicationId: string, step: ApplyStep | null, note: string | null): Promise<void> {
  check(await db.from("applications").update({ apply_step: step, apply_note: note }).eq("id", applicationId), "set apply step");
}

/** Clears progress left by a runner that stopped mid-application; returns how many. */
export async function clearStaleSteps(db: Db, userId: string): Promise<number> {
  const rows = unwrap(
    await db
      .from("applications")
      .update({ apply_step: null, apply_note: "The apply runner stopped before finishing; it will try again." })
      .eq("user_id", userId)
      .not("apply_step", "is", null)
      .select("id"),
    "clear stale apply steps",
  );
  return rows.length;
}

/** Downloads a resume PDF the user owns. */
export async function downloadResume(db: Db, path: string): Promise<Uint8Array> {
  const res = await db.storage.from(RESUME_BUCKET).download(path);
  if (res.error) throw new Error(`download resume: ${res.error.message}`);
  return new Uint8Array(await res.data.arrayBuffer());
}

/** Stores a screenshot and its evidence row. */
export async function addEvidence(
  db: Db,
  e: { userId: string; applicationId: string; kind: "screenshot" | "confirmation_page"; png: Uint8Array; textExcerpt?: string; detail: Json },
): Promise<void> {
  const path = `${e.userId}/${e.applicationId}/${e.kind}-${Date.now()}.png`;
  const up = await db.storage.from(EVIDENCE_BUCKET).upload(path, e.png, { contentType: "image/png" });
  if (up.error) throw new Error(`upload evidence: ${up.error.message}`);
  check(
    await db.from("application_evidence_items").insert({
      application_id: e.applicationId,
      kind: e.kind,
      storage_path: path,
      text_excerpt: e.textExcerpt ?? null,
      detail: e.detail,
    }),
    "add evidence",
  );
}

/** A user's trust row for one ATS, created supervised on first use. */
export async function getPlatform(db: Db, userId: string, ats: string): Promise<Platform> {
  const res = await db.from("platforms").select("*").eq("user_id", userId).eq("ats", ats).maybeSingle();
  if (res.error) unwrap(res, "get platform");
  if (res.data) return res.data;
  return unwrap(await db.from("platforms").insert({ user_id: userId, ats }).select().single(), "create platform");
}

/** A user's platforms, by ATS name. */
export async function listPlatforms(db: Db, userId: string): Promise<Platform[]> {
  return unwrap(await db.from("platforms").select("*").eq("user_id", userId).order("ats"), "list platforms");
}

/** Updates a platform's mode or streak. */
export async function updatePlatform(db: Db, userId: string, ats: string, changes: Partial<Pick<Platform, "mode" | "clean_streak">>): Promise<void> {
  check(await db.from("platforms").update(changes).eq("user_id", userId).eq("ats", ats), "update platform");
}
