// Resumes: tailor the profile to a posting with Claude, check the result with
// the fact guard (retry once with the problems, then fall back to the
// untailored resume), render a PDF and store it with its sha256.
import { createHash } from "node:crypto";
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import type { ProfileData } from "@/server/modules/profile/profile.service";
import type { PromptLesson } from "@/server/modules/matching/scoring-prompt";
import { recordUsage } from "@/server/modules/usage/usage.service";
import { guardResume } from "./fact-guard";
import { renderResumePdf } from "./render-pdf";
import { assembleResume, masterResume, tailorPlanSchema, type ResumeDoc } from "./resume-doc";
import { hasImportedResume, insertImportedResume, uploadPdf, upsertApplicationResume } from "./resumes.repository";
import { buildTailorPrompt } from "./tailor-prompt";

export { guardResume, numbersIn } from "./fact-guard";
export { renderResumePdf } from "./render-pdf";
export { assembleResume, masterResume, type ResumeDoc, type TailorPlan } from "./resume-doc";
export { getApplicationResume, signedPdfUrl, type Resume } from "./resumes.repository";

/** A tailored resume, or the untailored fallback with why tailoring was rejected. */
export type TailoredResume = { doc: ResumeDoc; kind: "tailored" | "fallback"; problems: string[] };

/**
 * Tailors the resume to a posting. A plan that fails the fact guard is sent
 * back once with its problems; if it fails again (or Claude gives no usable
 * output), the untailored resume is used and the problems are kept.
 */
export async function tailorResume(input: {
  db: Db;
  call: StructuredCall;
  data: ProfileData;
  lessons: PromptLesson[];
  posting: { title: string; company_name: string; text: string };
  jobId: string;
  now: Date;
  spend: { cost: number };
}): Promise<TailoredResume> {
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildTailorPrompt({ data: input.data, lessons: input.lessons, posting: input.posting, now: input.now, problems });
    const res = await input.call({ ...prompt, schema: tailorPlanSchema, maxTokens: 8000, effort: "medium" });
    input.spend.cost += await recordUsage(input.db, { purpose: "tailor", model: res.model, usage: res.usage, jobId: input.jobId });
    if (!res.output) {
      problems = [res.error ?? "no output"];
      continue;
    }
    problems = guardResume(res.output, input.data);
    if (problems.length === 0) return { doc: assembleResume(res.output, input.data), kind: "tailored", problems: [] };
  }
  return { doc: masterResume(input.data), kind: "fallback", problems };
}

/**
 * Renders an application's resume to PDF, uploads it to
 * `applications/<id>.pdf` and records it with its sha256.
 */
export async function saveApplicationResume(db: Db, applicationId: string, resume: TailoredResume, label: string): Promise<void> {
  const pdf = await renderResumePdf(resume.doc);
  const path = `applications/${applicationId}.pdf`;
  await uploadPdf(db, path, pdf);
  await upsertApplicationResume(db, {
    application_id: applicationId,
    kind: resume.kind,
    label,
    content: resume.doc as unknown as NonNullable<Json>,
    pdf_path: path,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    guard_problems: resume.problems as NonNullable<Json>,
  });
}

/**
 * Stores the resume text imported from the old app unless one is stored
 * (reference only; resumes are built from the profile).
 *
 * @returns Whether it was stored.
 */
export async function importResumeText(db: Db, label: string, text: string): Promise<boolean> {
  if (await hasImportedResume(db)) return false;
  await insertImportedResume(db, label, { text });
  return true;
}
