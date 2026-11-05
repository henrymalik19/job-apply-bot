"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { IllegalTransitionError } from "@/server/modules/applications/applications.service";
import type { EmailKind } from "@/server/modules/tracking/classify";
import { dismissEmail, linkEmail } from "@/server/modules/tracking/tracking.service";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import { recheckOpenQuestions } from "@/server/modules/prepare/prepare.service";

/** Links an email to an application (saying what it is, for an unsorted one) and moves it; returns an error message or null. */
export async function linkEmailAction(emailId: string, applicationId: string, kind?: EmailKind): Promise<string | null> {
  const { db, owner } = await ownerContext();
  try {
    await linkEmail(db, owner.id, emailId, applicationId, kind);
  } catch (err) {
    if (err instanceof ValidationError) return err.message;
    if (err instanceof IllegalTransitionError) return "Linked, but that application can't move that way from its current status.";
    throw err;
  }
  refresh();
  return null;
}

/** Marks an unmatched email as not about any application. */
export async function dismissEmailAction(emailId: string): Promise<void> {
  const { db, owner } = await ownerContext();
  await dismissEmail(db, owner.id, emailId);
  refresh();
}

/**
 * Sorts the open questions of your waiting applications again with today's rules, saved answers and
 * profile, filling what can be filled now.
 */
export async function recheckOpenQuestionsAction(): Promise<{ ok?: string; error?: string }> {
  const { db, owner } = await ownerContext();
  const counts = await recheckOpenQuestions({ db, userId: owner.id, call: createClaudeCaller() });
  refresh();
  if (counts.applications === 0) return { ok: "No open questions to recheck." };
  const parts = [
    `${counts.answered} ${counts.answered === 1 ? "answer" : "answers"} filled`,
    `${counts.answerable} ${counts.answerable === 1 ? "step" : "steps"} you can now answer here`,
    `${counts.movedToReview} moved to Ready to review`,
  ];
  return { ok: `Rechecked ${counts.applications} applications: ${parts.join(", ")}.` };
}
