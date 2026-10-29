"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { fetchJson } from "@/lib/discover/fetch";
import { parseKeywords } from "@/lib/discover/filter";
import { BOARD_ATS, BOARD_TOKEN, boardUrl, parseBoard } from "@/lib/discover/sources";

const board = z.object({
  ats: z.enum(BOARD_ATS),
  board_token: z.string().trim().regex(BOARD_TOKEN, "Board token: letters, numbers, dots, dashes or underscores."),
});

const company = board.extend({
  name: z.string().trim().min(1, "Enter the company name.").max(200),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
});

export type CompanyValues = { name?: string; ats?: string; board_token?: string; priority?: string };
export type FormState = { ok?: string; error?: string; sample?: string[]; values?: CompanyValues };

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input.";

// One action for the add-company form: the clicked button's intent picks
// "test" or "add". Values are echoed back so React's post-action form reset
// keeps what was typed (cleared only after a successful add).
export async function companyFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const values: CompanyValues = {
    name: String(formData.get("name") ?? ""),
    ats: String(formData.get("ats") ?? ""),
    board_token: String(formData.get("board_token") ?? ""),
    priority: String(formData.get("priority") ?? "0"),
  };
  const result = formData.get("intent") === "test" ? await testBoard(values) : await addCompany(values);
  return result.ok && formData.get("intent") !== "test" ? result : { ...result, values };
}

async function testBoard(values: CompanyValues): Promise<FormState> {
  const parsed = board.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const body = await fetchJson(boardUrl(parsed.data.ats, parsed.data.board_token), { attempts: 1, timeoutMs: 15_000 });
    const jobs = parseBoard(parsed.data.ats, body);
    return { ok: `Found ${jobs.length} open job${jobs.length === 1 ? "" : "s"}.`, sample: jobs.slice(0, 5).map((j) => j.title) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: /404/.test(message) ? "No board found for that token." : `Board check failed: ${message}` };
  }
}

async function addCompany(values: CompanyValues): Promise<FormState> {
  const parsed = company.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const db = await createUserClient();
  const { error } = await db.from("companies").insert(parsed.data);
  if (error) {
    return { error: error.code === "23505" ? "That board is already added." : `Could not add company: ${error.message}` };
  }
  refresh();
  return { ok: `Added ${parsed.data.name}. It will be checked on the next discovery run.` };
}

export async function setCompanyActive(formData: FormData) {
  await requireOwner();
  const parsed = z
    .object({ id: z.string().uuid(), active: z.enum(["true", "false"]) })
    .parse({ id: formData.get("id"), active: formData.get("active") });

  const db = await createUserClient();
  const { error } = await db.from("companies").update({ active: parsed.active === "true" }).eq("id", parsed.id);
  if (error) throw new Error(`Could not update company: ${error.message}`);
  refresh();
}

export async function saveFilter(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwner();
  const value = {
    include: parseKeywords(String(formData.get("include") ?? "")),
    exclude: parseKeywords(String(formData.get("exclude") ?? "")),
  };
  const db = await createUserClient();
  const { error } = await db
    .from("settings")
    .upsert({ key: "discover_filter", value, updated_at: new Date().toISOString() });
  if (error) return { error: `Could not save filter: ${error.message}` };
  refresh();
  return { ok: "Saved. Applies to jobs found from the next run on." };
}
