import type { Db } from "@/server/db/types";
import { check } from "@/server/core/errors";

/**
 * Records which auth user is the owner (the single row RLS checks through
 * `is_owner()`). Service role only: RLS hides this table from everyone else.
 */
export async function setOwner(db: Db, userId: string): Promise<void> {
  check(await db.from("owner").upsert({ singleton: true, user_id: userId }), "set owner");
}
