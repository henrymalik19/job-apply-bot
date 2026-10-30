"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import {
  addCompany,
  setCompanyActive,
  testBoard,
  type CompanyInput,
} from "@/server/modules/companies/companies.service";

/** Values typed into the add-company form, echoed back so they survive React's form reset. */
export type CompanyValues = { name?: string; ats?: string; board_token?: string };

/** State shared by the Companies page forms. */
export type FormState = { ok?: string; error?: string; sample?: string[]; values?: CompanyValues };

/** Turns a service error into form state; anything unexpected is rethrown to the error boundary. */
function toFormError(err: unknown, values?: CompanyValues): FormState {
  if (err instanceof ValidationError) return { error: err.message, values };
  throw err;
}

/**
 * Add-company form action. The clicked button's `intent` picks "test" (fetch the
 * board once) or "add". Values are echoed back unless the add succeeded.
 */
export async function companyFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db, owner } = await ownerContext();
  const values: CompanyValues = {
    name: String(formData.get("name") ?? ""),
    ats: String(formData.get("ats") ?? ""),
    board_token: String(formData.get("board_token") ?? ""),
  };
  const input: CompanyInput = values;
  try {
    if (formData.get("intent") === "test") {
      const check = await testBoard(input);
      return {
        ok: `Found ${check.count} open job${check.count === 1 ? "" : "s"}.`,
        sample: check.sampleTitles,
        values,
      };
    }
    const name = await addCompany(db, owner.id, input);
    refresh();
    return { ok: `Added ${name}. It will be checked on the next discovery run.` };
  } catch (err) {
    return toFormError(err, values);
  }
}

/** Pause/Resume button action for one company row. */
export async function toggleCompanyAction(formData: FormData) {
  const { db } = await ownerContext();
  await setCompanyActive(db, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}
