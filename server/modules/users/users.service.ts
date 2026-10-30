// Users: everyone in `users` (owner and members). Workers loop over them; each
// user's matches, applications, profile and settings are their own.
import type { Db } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";

/** A user workers run for. */
export type User = { id: string; role: string };

/** Every user, owner first. Service role only. */
export async function listUsers(db: Db): Promise<User[]> {
  const rows = unwrap(await db.from("users").select("id, role").order("role", { ascending: false }).order("created_at"), "list users");
  return rows;
}

/** The owner's id (the public page shows the owner's applications), or null when none is set. */
export async function ownerId(db: Db): Promise<string | null> {
  const res = await db.from("users").select("id").eq("role", "owner").maybeSingle();
  if (res.error) unwrap(res, "get owner");
  return res.data?.id ?? null;
}
