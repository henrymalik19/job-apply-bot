import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `confirmed_facts`. */
export type Fact = Row<"confirmed_facts">;

/** Fields for adding a fact. */
export type NewFact = Pick<Insert<"confirmed_facts">, "category" | "fact" | "structured" | "source" | "reviewed" | "sort_order">;

/**
 * Facts in display order (category, then sort order).
 *
 * @param activeOnly - Leave out deactivated facts (what prompts use).
 */
export async function listFacts(db: Db, activeOnly: boolean): Promise<Fact[]> {
  let query = db.from("confirmed_facts").select("*").order("category").order("sort_order").order("created_at");
  if (activeOnly) query = query.eq("active", true);
  return unwrap(await query, "list facts");
}

/** Adds facts. */
export async function insertFacts(db: Db, facts: NewFact[]): Promise<void> {
  if (facts.length) check(await db.from("confirmed_facts").insert(facts), "insert facts");
}

/** Updates one fact's text, review state or active flag. */
export async function updateFact(
  db: Db,
  id: string,
  changes: Partial<Pick<Fact, "fact" | "reviewed" | "active" | "category">>,
): Promise<void> {
  check(await db.from("confirmed_facts").update(changes).eq("id", id), "update fact");
}

/** How many facts exist (to decide whether to import a profile). */
export async function countFacts(db: Db): Promise<number> {
  const res = await db.from("confirmed_facts").select("id", { count: "exact", head: true });
  if (res.error) unwrap(res, "count facts");
  return res.count ?? 0;
}
