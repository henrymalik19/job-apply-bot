"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { addLesson, setLessonActive } from "@/server/modules/lessons/lessons.service";
import type { FormMessageState } from "../../_components/form-message";

/** Add-lesson form action. */
export async function addLessonAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  try {
    await addLesson(db, { rule: formData.get("rule"), scope: formData.get("scope") });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "Added. It applies from the next run." };
}

/** Turns a lesson on or off. */
export async function toggleLessonAction(formData: FormData) {
  const { db } = await ownerContext();
  await setLessonActive(db, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}
