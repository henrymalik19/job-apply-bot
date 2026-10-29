import type { Db, Json } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** Whether a master resume exists. */
export async function hasMasterResume(db: Db): Promise<boolean> {
  const res = await db.from("resumes").select("id", { count: "exact", head: true }).eq("is_master", true);
  if (res.error) unwrap(res, "check master resume");
  return (res.count ?? 0) > 0;
}

/** Stores the master resume (at most one, enforced by a unique index). */
export async function insertMasterResume(db: Db, label: string, content: NonNullable<Json>): Promise<void> {
  check(await db.from("resumes").insert({ label, content, is_master: true }), "insert master resume");
}
