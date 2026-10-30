import type { Db, Json } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** Reads one global setting's JSON value, or `null` when the key is missing. */
export async function getSetting(db: Db, key: string): Promise<Json | null> {
  const res = await db.from("settings").select("value").eq("key", key).maybeSingle();
  if (res.error) unwrap(res, `get setting ${key}`);
  return res.data?.value ?? null;
}

/** Creates or replaces one global setting. */
export async function putSetting(db: Db, key: string, value: NonNullable<Json>): Promise<void> {
  check(
    await db.from("settings").upsert({ key, value }),
    `put setting ${key}`,
  );
}

/** Reads one of a user's settings, or `null` when the key is missing. */
export async function getUserSetting(db: Db, userId: string, key: string): Promise<Json | null> {
  const res = await db.from("user_settings").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  if (res.error) unwrap(res, `get user setting ${key}`);
  return res.data?.value ?? null;
}

/** Creates or replaces one of a user's settings. */
export async function putUserSetting(db: Db, userId: string, key: string, value: NonNullable<Json>): Promise<void> {
  check(await db.from("user_settings").upsert({ user_id: userId, key, value }), `put user setting ${key}`);
}
