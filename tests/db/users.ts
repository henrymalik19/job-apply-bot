// Helpers for DB tests: the user the test acts for, and per-user settings
// that are set for a test and put back afterwards.
import { randomUUID } from "node:crypto";
import type { Db, Json } from "@/server/db/types";

/** The local owner, or a temporary one (removed by `cleanup`). */
export async function testUser(db: Db): Promise<{ id: string; cleanup: () => Promise<void> }> {
  const { data } = await db.from("users").select("id").eq("role", "owner").maybeSingle();
  if (data) return { id: data.id, cleanup: async () => {} };
  const id = randomUUID();
  await db.from("users").insert({ id, role: "owner" });
  return { id, cleanup: async () => void (await db.from("users").delete().eq("id", id)) };
}

/**
 * Sets some of a user's settings and returns a function that restores the
 * previous values (deleting keys that weren't set).
 */
export async function setUserSettings(db: Db, userId: string, values: Record<string, NonNullable<Json>>): Promise<() => Promise<void>> {
  const keys = Object.keys(values);
  const { data } = await db.from("user_settings").select("key, value").eq("user_id", userId).in("key", keys);
  const previous = new Map((data ?? []).map((r) => [r.key, r.value]));
  await db.from("user_settings").upsert(keys.map((key) => ({ user_id: userId, key, value: values[key] })));
  return async () => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) await db.from("user_settings").delete().eq("user_id", userId).eq("key", key);
      else await db.from("user_settings").upsert({ user_id: userId, key, value });
    }
  };
}

/** Settings that let every test job through discovery and matching. */
export const OPEN_FILTERS: Record<string, NonNullable<Json>> = { discover_filter: { include: [], exclude: [] }, discover_job_filter: {} };
