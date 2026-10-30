import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A `match_criteria` row. */
export type MatchCriteriaRow = Row<"match_criteria">;

/** A user's matching criteria row, or null when none is saved. */
export async function getCriteriaRow(db: Db, userId: string): Promise<MatchCriteriaRow | null> {
  const res = await db.from("match_criteria").select("*").eq("user_id", userId).maybeSingle();
  if (res.error) unwrap(res, "get match criteria");
  return res.data;
}

/** Creates or replaces a user's matching criteria. */
export async function upsertCriteriaRow(db: Db, userId: string, row: Omit<Insert<"match_criteria">, "user_id">): Promise<void> {
  check(await db.from("match_criteria").upsert({ ...row, user_id: userId }), "save match criteria");
}
