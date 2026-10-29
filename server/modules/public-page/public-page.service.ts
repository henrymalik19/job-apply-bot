// The optional public status page: a read-only summary of the search that the
// owner can switch on in Settings. Off by default. Reads only the
// public_status view (title, company, status, dates) with the service role,
// server-side, and only while the setting is on.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import * as settings from "@/server/modules/settings/settings.service";
import { countScannedJobs, listPublicApplications, type PublicApplication } from "./public-page.repository";

/** Settings key for the public page switch. */
export const PUBLIC_PAGE_KEY = "public_page_enabled";

const DAYS = 30;

/** Everything the public page renders. */
export type PublicPage = {
  counts: { label: string; value: number }[];
  /** Applications sent per day for the last 30 days, oldest first (`date` is YYYY-MM-DD, UTC). */
  sentPerDay: { date: string; count: number }[];
  applications: PublicApplication[];
};

/** Whether the public page is switched on. */
export async function isPublicPageEnabled(db: Db): Promise<boolean> {
  return z.boolean().catch(false).parse(await settings.getSetting(db, PUBLIC_PAGE_KEY));
}

/** Switches the public page on or off. */
export async function setPublicPageEnabled(db: Db, enabled: boolean): Promise<void> {
  await settings.putSetting(db, PUBLIC_PAGE_KEY, enabled);
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Builds the public page, or returns `null` when it is switched off (the
 * route then responds 404).
 *
 * @param db - Service-role client (the view is not granted to signed-in users).
 */
export async function getPublicPage(db: Db, now: Date): Promise<PublicPage | null> {
  if (!(await isPublicPageEnabled(db))) return null;
  const [applications, scanned] = await Promise.all([listPublicApplications(db), countScannedJobs(db)]);

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

  return { counts, sentPerDay, applications };
}
