"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { saveTitleFilter } from "@/server/modules/criteria/criteria.service";
import type { FormMessageState } from "../_components/form-message";

/** Title-filter form action. */
export async function saveTitleFilterAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  await saveTitleFilter(db, String(formData.get("include") ?? ""), String(formData.get("exclude") ?? ""));
  refresh();
  return { ok: "Saved. Applies to jobs found from the next discovery run on." };
}
