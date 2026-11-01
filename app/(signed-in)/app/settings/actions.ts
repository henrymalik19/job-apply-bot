"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { APPLY_ATS, setPlatformMode } from "@/server/modules/apply/apply.service";
import { setPublicPageEnabled } from "@/server/modules/public-page/public-page.service";

/** Switches an apply platform between supervised and auto (fields `ats`, `mode`). */
export async function setPlatformModeAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  const ats = String(formData.get("ats"));
  if (!(APPLY_ATS as readonly string[]).includes(ats)) return;
  await setPlatformMode(db, owner.id, ats, formData.get("mode") === "auto" ? "auto" : "supervised");
  refresh();
}

/** Turns the public status page on or off (form field `enabled` = "true" | "false"). */
export async function setPublicPageAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await setPublicPageEnabled(db, owner.id, formData.get("enabled") === "true");
  refresh();
}
