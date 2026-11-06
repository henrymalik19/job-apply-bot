"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { APPLY_ATS, setPlatformMode } from "@/server/modules/apply/apply.service";
import { ValidationError } from "@/server/core/errors";
import { setPublicHandle, setPublicPageEnabled } from "@/server/modules/public-page/public-page.service";
import { setLinkedInResume } from "@/server/modules/apply/linkedin-resume";

/** Chooses the resume LinkedIn applications send (field `onFile` = "true": the one on LinkedIn; else tailored). */
export async function setLinkedInResumeAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await setLinkedInResume(db, owner.id, formData.get("onFile") === "true");
  refresh();
}

/** Switches an apply platform between supervised and auto (fields `ats`, `mode`). */
export async function setPlatformModeAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  const ats = String(formData.get("ats"));
  if (!(APPLY_ATS as readonly string[]).includes(ats)) return;
  await setPlatformMode(db, owner.id, ats, formData.get("mode") === "auto" ? "auto" : "supervised");
  refresh();
}

/** Turns the public status page on or off (form field `enabled` = "true" | "false"). */
export async function setPublicPageAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await setPublicPageEnabled(db, owner.id, formData.get("enabled") === "true");
  refresh();
}

/** State of the handle form: an error, or the saved handle. */
export type HandleState = { error?: string; saved?: string };

/** Sets the handle in the public page's address, /u/<handle> (form field `handle`). */
export async function setPublicHandleAction(_prev: HandleState, formData: FormData): Promise<HandleState> {
  const { db, owner } = await ownerContext();
  try {
    const saved = await setPublicHandle(db, owner.id, String(formData.get("handle") ?? ""));
    refresh();
    return { saved };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}
