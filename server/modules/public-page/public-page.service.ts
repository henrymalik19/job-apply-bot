// The optional public status page: a read-only summary of one user's search at
// /u/<handle>, which they switch on and name in Settings. Off by default. Reads only
// the public_applications view (title, company, status, dates) with the service role,
// server-side, and only while that user's setting is on.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import * as settings from "@/server/modules/settings/settings.service";
import { ValidationError } from "@/server/core/errors";
import { countScannedJobs, listPublicApplications, type PublicApplication } from "./public-page.repository";

/** Settings key for the public page switch. */
export const PUBLIC_PAGE_KEY = "public_page_enabled";
/** Settings key for the handle in the page's address, /u/<handle>. */
export const PUBLIC_HANDLE_KEY = "public_handle";
/** A handle: 3 to 30 lowercase letters, digits or dashes, starting with a letter or digit. */
export const HANDLE = /^[a-z0-9][a-z0-9-]{2,29}$/;

const DAYS = 30;

/** Everything the public page renders. */
export type PublicPage = {
  /** Their first name, for the page title ("Malik's job search"); null if the profile has none. */
  name: string | null;
  counts: { label: string; value: number }[];
  /** Applications sent per day for the last 30 days, oldest first (`date` is YYYY-MM-DD, UTC). */
  sentPerDay: { date: string; count: number }[];
  applications: PublicApplication[];
};

/** Whether a user's public page is switched on. */
export async function isPublicPageEnabled(db: Db, userId: string): Promise<boolean> {
  return z.boolean().catch(false).parse(await settings.getUserSetting(db, userId, PUBLIC_PAGE_KEY));
}

/** Switches a user's public page on or off. */
export async function setPublicPageEnabled(db: Db, userId: string, enabled: boolean): Promise<void> {
  await settings.putUserSetting(db, userId, PUBLIC_PAGE_KEY, enabled);
}

/** A user's handle, or null before they pick one. */
export async function getPublicHandle(db: Db, userId: string): Promise<string | null> {
  return z.string().nullable().catch(null).parse(await settings.getUserSetting(db, userId, PUBLIC_HANDLE_KEY));
}

/**
 * Sets a user's handle (their page moves to /u/<handle>).
 *
 * @throws {@link ValidationError} for a handle that isn't valid or belongs to someone else.
 */
export async function setPublicHandle(db: Db, userId: string, raw: string): Promise<string> {
  const handle = raw.trim().toLowerCase();
  if (!HANDLE.test(handle)) throw new ValidationError("Use 3 to 30 lowercase letters, numbers or dashes.");
  try {
    await settings.putUserSetting(db, userId, PUBLIC_HANDLE_KEY, handle);
  } catch (err) {
    // The unique index on handles: someone else has it.
    if (/duplicate|unique/i.test(String((err as Error)?.message))) throw new ValidationError("That handle is taken; try another.");
    throw err;
  }
  return handle;
}

/** Whether /u/<handle> is a page that's switched on. Service role. */
export async function isPublicPageLive(db: Db, handle: string): Promise<boolean> {
  const userId = await userByHandle(db, handle);
  return userId ? isPublicPageEnabled(db, userId) : false;
}

/** The user with this handle, or null. Service role (it reads every user's settings). */
async function userByHandle(db: Db, handle: string): Promise<string | null> {
  if (!HANDLE.test(handle)) return null;
  const { data } = await db.from("user_settings").select("user_id").eq("key", PUBLIC_HANDLE_KEY).eq("value", JSON.stringify(handle)).limit(1);
  return data?.[0]?.user_id ?? null;
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Builds the public page, or returns `null` when it is switched off (the
 * route then responds 404).
 *
 * @param db - Service-role client (the view is not granted to signed-in users).
 */
export async function getPublicPage(db: Db, handle: string, now: Date): Promise<PublicPage | null> {
  const userId = await userByHandle(db, handle);
  if (!userId || !(await isPublicPageEnabled(db, userId))) return null;
  const [applications, scanned, name] = await Promise.all([listPublicApplications(db, userId), countScannedJobs(db), firstName(db, userId)]);

  const count = (statuses: string[]) => applications.filter((a) => statuses.includes(a.status)).length;
  const counts = [
    { label: "Jobs scanned", value: scanned },
    { label: "Applications sent", value: applications.filter((a) => a.submitted_at).length },
    { label: "Responded", value: count(["responded", "interviewing", "offer"]) },
    { label: "Interviewing", value: count(["interviewing"]) },
    { label: "Offers", value: count(["offer"]) },
    { label: "Rejected", value: count(["rejected"]) },
  ];

  const sentPerDay = Array.from({ length: DAYS }, (_, i) => {
    const date = day(new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000).toISOString());
    return { date, count: applications.filter((a) => a.submitted_at && day(a.submitted_at) === date).length };
  });

  return { name, counts, sentPerDay, applications };
}

/** A user's first (or preferred) name from their profile. */
async function firstName(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("first_name, preferred_name").eq("user_id", userId).maybeSingle();
  return data?.preferred_name || data?.first_name || null;
}
