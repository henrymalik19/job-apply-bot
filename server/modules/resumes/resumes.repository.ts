import type { Db, Insert, Json, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `resumes`. */
export type Resume = Row<"resumes">;

/** The private Storage bucket that holds resume PDFs. */
export const RESUME_BUCKET = "resumes";

/** Whether the resume text imported from the old app is stored. */
export async function hasImportedResume(db: Db): Promise<boolean> {
  const res = await db.from("resumes").select("id", { count: "exact", head: true }).eq("kind", "imported");
  if (res.error) unwrap(res, "check imported resume");
  return (res.count ?? 0) > 0;
}

/** Stores the resume text imported from the old app (reference only). */
export async function insertImportedResume(db: Db, label: string, content: NonNullable<Json>): Promise<void> {
  check(await db.from("resumes").insert({ label, content, kind: "imported" }), "insert imported resume");
}

/** Uploads (or replaces) a PDF in the resumes bucket. */
export async function uploadPdf(db: Db, path: string, pdf: Uint8Array): Promise<void> {
  const res = await db.storage.from(RESUME_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (res.error) throw new Error(`upload resume PDF: ${res.error.message}`);
}

/** Creates or replaces an application's resume row. */
export async function upsertApplicationResume(
  db: Db,
  row: Pick<Insert<"resumes">, "application_id" | "kind" | "label" | "content" | "pdf_path" | "sha256" | "guard_problems">,
): Promise<void> {
  check(await db.from("resumes").upsert(row, { onConflict: "application_id" }), "save application resume");
}

/** An application's resume, if prepared. */
export async function getApplicationResume(db: Db, applicationId: string): Promise<Resume | null> {
  const res = await db.from("resumes").select("*").eq("application_id", applicationId).maybeSingle();
  if (res.error) unwrap(res, "get application resume");
  return res.data;
}

/** A short-lived link to download a resume PDF. */
export async function signedPdfUrl(db: Db, path: string, expiresInSeconds = 300): Promise<string> {
  const res = await db.storage.from(RESUME_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (res.error) throw new Error(`sign resume URL: ${res.error.message}`);
  return res.data.signedUrl;
}
