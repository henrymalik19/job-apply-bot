"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { addFact, confirmFact, editFact, setFactActive } from "@/server/modules/profile/profile.service";
import type { FormMessageState } from "../../_components/form-message";

/** Add-fact form action. */
export async function addFactAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  try {
    await addFact(db, { category: formData.get("category"), fact: formData.get("fact") });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok: "Added." };
}

/** Marks a fact as reviewed. */
export async function confirmFactAction(formData: FormData) {
  const { db } = await ownerContext();
  await confirmFact(db, String(formData.get("id")));
  refresh();
}

/** Turns a fact on or off. */
export async function toggleFactAction(formData: FormData) {
  const { db } = await ownerContext();
  await setFactActive(db, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}

/** Saves an edited fact (it becomes reviewed). */
export async function editFactAction(formData: FormData) {
  const { db } = await ownerContext();
  await editFact(db, String(formData.get("id")), String(formData.get("fact") ?? ""));
  refresh();
}
