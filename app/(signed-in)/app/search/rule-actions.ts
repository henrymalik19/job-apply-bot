"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { addLesson, setLessonActive } from "@/server/modules/lessons/lessons.service";
import type { FormMessageState } from "../../_components/form-message";

/** Add-rule form action. */
export async function addLessonAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await addLesson(db, owner.id, { rule: formData.get("rule"), scope: formData.get("scope") });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "Added. Claude follows it from the next run." };
}

/** Turns a rule on or off. */
export async function toggleLessonAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await setLessonActive(db, owner.id, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}
