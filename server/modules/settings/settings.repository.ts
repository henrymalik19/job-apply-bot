import type { Db, Json } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** Reads one setting's JSON value, or `null` when the key is missing. */
export async function getSetting(db: Db, key: string): Promise<Json | null> {
  const res = await db.from("settings").select("value").eq("key", key).maybeSingle();
  if (res.error) unwrap(res, `get setting ${key}`);
  return res.data?.value ?? null;
}

/** Creates or replaces one setting. */
export async function putSetting(db: Db, key: string, value: NonNullable<Json>): Promise<void> {
  check(
    await db.from("settings").upsert({ key, value }),
    `put setting ${key}`,
  );
}
