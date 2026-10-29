import type { Db } from "@/server/db/types";
import { check } from "@/server/core/errors";

/**
 * Makes an auth user the owner (RLS checks `users` through `is_owner()`).
 * There is one owner during the MVP, so a previous owner becomes a member
 * (nothing is deleted, so their profile stays). Service role only.
 */
export async function setOwner(db: Db, userId: string): Promise<void> {
  check(await db.from("users").update({ role: "member" }).eq("role", "owner").neq("id", userId), "demote previous owner");
  check(await db.from("users").upsert({ id: userId, role: "owner" }, { onConflict: "id" }), "set owner");
}
