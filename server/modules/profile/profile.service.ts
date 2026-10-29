// The owner's profile: facts the scorer (and later the tailoring fact guard)
// may use. Scoring reads every active fact; tailoring (M5) will accept only
// reviewed ones.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { ValidationError } from "@/server/core/errors";
import { countFacts, insertFacts, listFacts, updateFact, type Fact, type NewFact } from "./facts.repository";
import { hasMasterResume, insertMasterResume } from "./resumes.repository";

export type { Fact, NewFact } from "./facts.repository";

/** Fact categories, in display order. */
export const FACT_CATEGORIES = [
  "summary", "employment", "education", "skill", "metric", "authorization", "logistics", "link", "other",
] as const;

/** One fact category. */
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** Every fact (including deactivated ones), for the Profile page. */
export async function listProfileFacts(db: Db): Promise<Fact[]> {
  return listFacts(db, false);
}

/** Active facts, for prompts. */
export async function listActiveFacts(db: Db): Promise<Fact[]> {
  return listFacts(db, true);
}

const newFactInput = z.object({
  category: z.enum(FACT_CATEGORIES, { message: "Pick a category." }),
  fact: z.string().trim().min(3, "Write the fact.").max(1000),
});

/**
 * Adds a fact typed by the owner. It counts as reviewed, since the owner wrote it.
 *
 * @throws {@link ValidationError} for an empty fact or unknown category.
 */
export async function addFact(db: Db, input: { category: unknown; fact: unknown }): Promise<void> {
  const parsed = newFactInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid fact.");
  await insertFacts(db, [{ ...parsed.data, source: "typed", reviewed: true, sort_order: 0 }]);
}

/** Marks a fact as reviewed (confirmed true by the owner). */
export async function confirmFact(db: Db, id: string): Promise<void> {
  await updateFact(db, z.string().uuid().parse(id), { reviewed: true });
}

/** Turns a fact on or off without deleting it. */
export async function setFactActive(db: Db, id: string, active: boolean): Promise<void> {
  await updateFact(db, z.string().uuid().parse(id), { active });
}

/** Rewrites a fact's text; the owner wrote it, so it becomes reviewed. */
export async function editFact(db: Db, id: string, fact: string): Promise<void> {
  const text = z.string().trim().min(3).max(1000).parse(fact);
  await updateFact(db, z.string().uuid().parse(id), { fact: text, reviewed: true });
}

/**
 * Imports facts (e.g. from the old app's profile) unless facts already exist.
 * Imported facts start unreviewed.
 *
 * @returns How many were imported (0 when the profile already had facts).
 */
export async function importFacts(db: Db, facts: NewFact[]): Promise<number> {
  if ((await countFacts(db)) > 0) return 0;
  await insertFacts(db, facts.map((f) => ({ ...f, reviewed: false })));
  return facts.length;
}

/**
 * Stores a master resume (plain text) unless one exists. Tailoring (M5)
 * starts from the master.
 *
 * @returns Whether it was stored.
 */
export async function importMasterResume(db: Db, label: string, text: string): Promise<boolean> {
  if (await hasMasterResume(db)) return false;
  await insertMasterResume(db, label, { text });
  return true;
}
