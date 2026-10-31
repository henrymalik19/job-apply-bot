"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ownerContext } from "@/server/auth/require-owner";
import { createClaudeCaller, DRAFTING_MODEL } from "@/server/integrations/anthropic/claude";
import { ValidationError } from "@/server/core/errors";
import { answerQuestion, approveApplication, IllegalTransitionError, skipApplication } from "@/server/modules/applications/applications.service";
import { redraftAnswer } from "@/server/modules/prepare/prepare.service";
import type { FormMessageState } from "../../_components/form-message";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Answers (or edits the answer to) one question; optionally saves it for reuse and as a lesson. */
export async function answerQuestionAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    const result = await answerQuestion(db, owner.id, {
      applicationId: text(formData, "application_id"),
      questionId: text(formData, "question_id"),
      answer: text(formData, "answer"),
      save: formData.get("save") === "on",
      lesson: text(formData, "lesson"),
    });
    refresh();
    return { ok: result.movedToReview ? `${result.note} Nothing else is blocking it: moved to Review.` : result.note };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

/** Approves a queued application. */
export async function approveAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await approveApplication(db, owner.id, text(formData, "application_id"));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof IllegalTransitionError) return { error: err.message };
    throw err;
  }
  redirect("/app/review");
}

/** Skips an application, with an optional reason and lesson. */
export async function skipAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await skipApplication(db, owner.id, text(formData, "application_id"), {
      reason: text(formData, "reason"),
      lesson: text(formData, "lesson"),
      lessonScope: text(formData, "lesson_scope") || "scoring",
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof IllegalTransitionError) return { error: err.message };
    throw err;
  }
  redirect(text(formData, "back") || "/app/review");
}

/** Redrafts one answer with AI, with optional guidance for this answer. */
export async function redraftAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await redraftAnswer({
      db,
      userId: owner.id,
      call: createClaudeCaller(DRAFTING_MODEL),
      applicationId: text(formData, "application_id"),
      questionId: text(formData, "question_id"),
      guidance: text(formData, "guidance"),
    });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "New draft below. Check it, then save." };
}
