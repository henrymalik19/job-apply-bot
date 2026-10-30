"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { setPublicPageEnabled } from "@/server/modules/public-page/public-page.service";

/** Turns the public status page on or off (form field `enabled` = "true" | "false"). */
export async function setPublicPageAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await setPublicPageEnabled(db, owner.id, formData.get("enabled") === "true");
  refresh();
}
