import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `profile_facts`: a free-form fact the structured profile has no place for. */
export type Fact = Row<"profile_facts">;

/** Fields for adding a fact. */
export type NewFact = Pick<Insert<"profile_facts">, "category" | "fact" | "source" | "sort_order">;

/** Every fact (including turned-off ones), in display order. */
export async function listFacts(db: Db): Promise<Fact[]> {
  return unwrap(await db.from("profile_facts").select("*").order("category").order("sort_order").order("created_at"), "list facts");
}

/** Adds facts. */
export async function insertFacts(db: Db, facts: NewFact[]): Promise<void> {
  if (facts.length) check(await db.from("profile_facts").insert(facts), "insert facts");
}

/** Updates one fact's text, category or active flag. */
export async function updateFact(db: Db, id: string, changes: Partial<Pick<Fact, "fact" | "active" | "category">>): Promise<void> {
  check(await db.from("profile_facts").update(changes).eq("id", id), "update fact");
}
