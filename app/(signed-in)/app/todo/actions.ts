"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { IllegalTransitionError } from "@/server/modules/applications/applications.service";
import type { EmailKind } from "@/server/modules/tracking/classify";
import { dismissEmail, linkEmail } from "@/server/modules/tracking/tracking.service";

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

