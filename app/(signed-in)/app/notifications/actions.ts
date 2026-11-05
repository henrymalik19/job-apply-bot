"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { markRead } from "@/server/modules/notifications/in-app";

/** Marks notifications read: these ones, or all of yours without `ids`. */
export async function markNotificationsReadAction(ids?: string[]): Promise<void> {
  const { db, owner } = await ownerContext();
  await markRead(db, owner.id, ids);
  refresh();
}
