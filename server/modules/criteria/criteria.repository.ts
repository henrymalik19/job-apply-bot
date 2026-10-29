import type { Db, Json } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";

/** A stored criteria version (raw JSON; parse with `matchCriteriaSchema`). */
export type CriteriaVersionRow = { id: string; criteria: Json; created_at: string };

/** The newest criteria version, or null when none exists yet. */
export async function latestCriteriaVersion(db: Db): Promise<CriteriaVersionRow | null> {
  const res = await db
    .from("criteria_versions")
    .select("id, criteria, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) unwrap(res, "latest criteria version");
  return res.data;
}

/** Inserts a new criteria version and returns it. */
export async function insertCriteriaVersion(db: Db, criteria: NonNullable<Json>): Promise<CriteriaVersionRow> {
  return unwrap(
    await db.from("criteria_versions").insert({ criteria }).select("id, criteria, created_at").single(),
    "insert criteria version",
  );
}
