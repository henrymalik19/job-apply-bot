"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ownerContext } from "@/server/auth/require-owner";
import { createClaudeCaller, DRAFTING_MODEL } from "@/server/integrations/anthropic/claude";
import { ValidationError } from "@/server/core/errors";
import { answerQuestions, approveApplication, IllegalTransitionError, moveApplication, skipApplication } from "@/server/modules/applications/applications.service";
import { retryApply } from "@/server/modules/apply/apply.service";
import { excludeCompany } from "@/server/modules/criteria/criteria.service";
import { redraftAnswer } from "@/server/modules/prepare/prepare.service";
import type { FormMessageState } from "../../_components/form-message";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Saves a group of answers (fields named answer:<question id>) with one Save. */
export async function answerQuestionsAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  const answers = [...formData.entries()]
    .filter(([key]) => key.startsWith("answer:"))
    .map(([key, value]) => ({ questionId: key.slice("answer:".length), answer: String(value) }));
  try {
    const result = await answerQuestions(db, owner.id, { applicationId: text(formData, "application_id"), answers, confirmUnchanged: formData.get("confirm") === "1" });
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
  redirect("/app/todo?tab=ready");
}

/** Sends an application the apply runner handed back to it again. */
export async function retryApplyAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await retryApply(db, owner.id, text(formData, "application_id"));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof IllegalTransitionError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "Sent back to the apply runner; it picks it up within 20 seconds while it's running." };
}

/**
 * Moves an application by hand (board drag, Move menu, "I applied"); returns an error message or null.
 * Moving a stuck one back to Approved sends it to the apply runner again.
 */
export async function moveApplicationAction(applicationId: string, to: string): Promise<string | null> {
  const { db, owner } = await ownerContext();
  try {
    if (to === "approved") await retryApply(db, owner.id, applicationId);
    else await moveApplication(db, owner.id, applicationId, to);
  } catch (err) {
    if (err instanceof ValidationError) return err.message;
    if (err instanceof IllegalTransitionError) return "That move isn't allowed from its current status.";
    throw err;
  }
  refresh();
  return null;
}

/** Skips an application, with an optional reason and lesson, and optionally never matches its company again. */
export async function skipAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await skipApplication(db, owner.id, text(formData, "application_id"), {
      reason: text(formData, "reason"),
      lesson: text(formData, "lesson"),
      lessonScope: text(formData, "lesson_scope") || "scoring",
    });
    if (formData.get("exclude_company") === "on") await excludeCompany(db, owner.id, text(formData, "company"));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof IllegalTransitionError) return { error: err.message };
    throw err;
  }
  redirect(text(formData, "back") || "/app/todo");
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
      questionId: text(formData, "draft_question") || text(formData, "question_id"),
      guidance: text(formData, `guidance:${text(formData, "draft_question")}`) || text(formData, "guidance"),
    });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "New draft below. Check it, then save." };
}
