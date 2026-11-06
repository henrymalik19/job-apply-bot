// Whether LinkedIn applications use the resume you keep on LinkedIn instead of one tailored to each job.
// On, LinkedIn jobs skip tailoring (no Claude call, no PDF) and the runner leaves LinkedIn's own resume
// picked on the form's resume page. Off (the default), each gets its tailored resume uploaded.
import type { Db } from "@/server/db/types";
import { getUserSetting, putUserSetting } from "@/server/modules/settings/settings.repository";

/** The user setting that holds it. */
export const LINKEDIN_RESUME_KEY = "linkedin_resume_on_file";

/** Whether LinkedIn applications use the resume on LinkedIn (off unless you turned it on). */
export async function usesLinkedInResume(db: Db, userId: string): Promise<boolean> {
  return (await getUserSetting(db, userId, LINKEDIN_RESUME_KEY)) === true;
}

/** Turns using the resume on LinkedIn on or off. */
export async function setLinkedInResume(db: Db, userId: string, onFile: boolean): Promise<void> {
  await putUserSetting(db, userId, LINKEDIN_RESUME_KEY, onFile);
}

/** Whether this job's application skips a tailored resume: a LinkedIn job, with the setting on. */
export async function skipsTailoring(db: Db, userId: string, source: string): Promise<boolean> {
  return source === "linkedin" && (await usesLinkedInResume(db, userId));
}
