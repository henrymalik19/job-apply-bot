"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { clearLimit } from "@/server/modules/companies/apply-limits";
import {
  addCompany,
  findBoards,
  parseBoardUrl,
  setCompanyActive,
  testBoard,
  type CompanyInput,
  type FoundBoard,
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

/** State of the find-a-company form: what was searched and the boards that answered. */
export type FindState = { query?: string; name?: string; found?: FoundBoard[]; error?: string };

/** Finds a company's job board from its name or a board URL. */
export async function findCompanyAction(_prev: FindState, formData: FormData): Promise<FindState> {
  await ownerContext();
  const query = String(formData.get("query") ?? "").trim().slice(0, 300);
  if (!query) return { error: "Enter a company name or a job-board URL." };
  const fromUrl = parseBoardUrl(query);
  // A URL has no company name; start from the token ("scale-ai" -> "Scale Ai") and let the name be edited.
  const name = fromUrl ? fromUrl.board_token.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : query;
  const found = await findBoards(query);
  if (found.length === 0) {
    return {
      query,
      error: fromUrl
        ? "That board didn't answer. Check the link."
        : `No Greenhouse, Lever or Ashby board found for "${query}". Paste a link to one of its job postings instead.`,
    };
  }
  return { query, name, found };
}

/** Clear button under a company's limit: it no longer has one, or the date is wrong. */
export async function clearLimitAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await clearLimit(db, owner.id, String(formData.get("id")));
  refresh();
}

/** Pause/Resume button action for one company row. */
export async function toggleCompanyAction(formData: FormData) {
  const { db } = await ownerContext();
  await setCompanyActive(db, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}
