// Searches LinkedIn for Easy Apply jobs in the runner's own Chrome, where you signed in to LinkedIn yourself.
// The results list doesn't carry job ids, so each card is clicked (at a person's pace) and the job shown
// beside it is read: its id from the address, its title and company, where it is, its pay and its description.
// A security check or CAPTCHA stops the search; it's never worked around.
import type { Page } from "playwright-core";
import type { LinkedInJob } from "@/server/modules/discovery/linkedin-jobs";
import { HUMAN, pause, type Pace } from "./human";

/** What to search for: your roles, where, and how recent. */
export type LinkedInSearch = { keywords: string; remoteOnly: boolean; location: string | null; maxAgeHours: number };

/**
 * How far back a search looks, in hours: back to the last search with two hours' overlap, at least a day and
 * at most a week (also the first search, with none before it). Nothing posted while the runner was off is missed.
 */
export function searchWindowHours(lastSearch: number | null, now: number): number {
  if (!lastSearch) return 7 * 24;
  return Math.min(7 * 24, Math.max(24, Math.ceil((now - lastSearch) / 3_600_000) + 2));
}

/** The most result pages read per search (25 results each). */
const MAX_PAGES = 3;

/** LinkedIn's id for the United States: its search takes a place by id, and a name only sometimes. */
const UNITED_STATES = "103644278";

/**
 * The search page for Easy Apply jobs matching `search`. LinkedIn's results page drops its remote filter
 * (f_WT), and its search reads the keywords as a request, so remote is asked for in them ("... remote").
 */
export function linkedinSearchUrl(search: LinkedInSearch): string {
  const keywords = search.remoteOnly && !/\bremote\b/i.test(search.keywords) ? `${search.keywords} remote` : search.keywords;
  const q = new URLSearchParams({ keywords, f_AL: "true", f_TPR: `r${Math.round(search.maxAgeHours * 3600)}` });
  if (search.location && /^(us|usa|united states)$/i.test(search.location.trim())) q.set("geoId", UNITED_STATES);
  else if (search.location) q.set("location", search.location);
  return `https://www.linkedin.com/jobs/search-results/?${q}`;
}

/** "Title | Company | LinkedIn" (a title can hold "|" itself): the title and the company. */
export function splitPageTitle(title: string): { title: string; company: string } | null {
  const parts = title.replace(/^\(\d+\)\s*/, "").split(" | ");
  if (parts.length < 3 || parts[parts.length - 1].trim() !== "LinkedIn") return null;
  return { title: parts.slice(0, -2).join(" | ").trim(), company: parts[parts.length - 2].trim() };
}

/** "$198.8K/yr" -> 198800; "$75/hr" -> null (hourly pay isn't a yearly salary). */
const yearly = (s: string) => {
  const m = /\$([\d,.]+)\s*(k)?\s*\/\s*yr/i.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * The job's details from the lines above its description: "United States · 2 hours ago · 45 applicants",
 * "$198.8K/yr - $295K/yr", "Remote".
 */
export function parseJobHead(head: string, now: Date): Pick<LinkedInJob, "location" | "remoteType" | "salaryMin" | "salaryMax" | "postedAt"> {
  const lines = head.split("\n").map((l) => l.trim()).filter(Boolean);
  const where = lines.find((l) => l.includes(" · ")) ?? "";
  const location = where.split(" · ")[0]?.trim() || null;
  const pay = lines.find((l) => /\$[\d,.]+k?\s*\/\s*yr/i.test(l)) ?? "";
  const [low, high] = pay.split(/\s+-\s+/);
  const remoteType = lines.some((l) => /^remote$/i.test(l)) || /\(remote\)/i.test(location ?? "") ? "remote"
    : lines.some((l) => /^hybrid$/i.test(l)) ? "hybrid"
    : lines.some((l) => /^on-?site$/i.test(l)) ? "onsite"
    : "unknown";
  const ago = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(where);
  const unit = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[ago?.[2].toLowerCase() ?? ""] ?? 0;
  return {
    location: location?.replace(/\s*\((remote|hybrid|on-?site)\)\s*$/i, "") || null,
    remoteType,
    salaryMin: low ? yearly(low) : null,
    salaryMax: high ? yearly(high) : low ? yearly(low) : null,
    postedAt: ago ? new Date(now.getTime() - Number(ago[1]) * unit).toISOString() : null,
  };
}

const CHECK = /security (check|verification)|verify (it'?s you|you'?re (a )?human)|captcha|unusual activity/i;

/** Whether LinkedIn is showing a security check, a CAPTCHA or its sign-in page instead of jobs. */
export async function linkedinBlocked(page: Page): Promise<"check" | "signed_out" | null> {
  const url = page.url();
  if (/\/checkpoint\/|captcha/i.test(url)) return "check";
  if (/\/(login|uas\/login|authwall|signup)/i.test(url)) return "signed_out";
  // Signed out, LinkedIn shows its public jobs pages rather than the sign-in page: they offer "Sign in" and "Join now".
  const offers = await page.locator("a:visible, button:visible").filter({ hasText: /^\s*(sign in|join now)\s*$/i }).count().catch(() => 0);
  if (offers > 0) return "signed_out";
  return CHECK.test((await page.locator("body").innerText().catch(() => "")).slice(0, 4000)) ? "check" : null;
}

/**
 * The Easy Apply jobs a search shows, read one card at a time.
 *
 * @param seen - Job ids already known: their cards are skipped without reading.
 * @param limit - The most new jobs to read.
 * @returns The jobs read, or why the search stopped (a check, or signed out of LinkedIn).
 */
export async function searchLinkedIn(
  page: Page,
  search: LinkedInSearch,
  seen: ReadonlySet<string>,
  limit: number,
  log: (line: string) => void,
  pace: Pace = HUMAN,
  now = new Date(),
): Promise<{ jobs: LinkedInJob[]; blocked: "check" | "signed_out" | null }> {
  await page.goto(linkedinSearchUrl(search), { waitUntil: "domcontentloaded" });
  const cards = page.locator('button[aria-label^="Dismiss "][aria-label$=" job"]');
  await cards.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const blocked = await linkedinBlocked(page);
  if (blocked) return { jobs: [], blocked };

  const jobs: LinkedInJob[] = [];
  let total = 0;
  // Why results weren't kept, for the log: no job id, already known, or the job's details didn't show.
  const skipped = { known: 0, noId: 0, unread: 0 };
  // Page by page (25 results each) until enough new jobs, the last page, or MAX_PAGES.
  for (let pageNo = 1; pageNo <= MAX_PAGES && jobs.length < limit; pageNo++) {
    if (pageNo > 1) {
      const next = page.getByRole("button", { name: /^(next|view next page)$/i }).first();
      if (!(await next.isVisible().catch(() => false)) || (await next.isDisabled().catch(() => true))) break;
      const firstBefore = await cards.first().getAttribute("aria-label").catch(() => null);
      await pause(page, pace);
      await next.click();
      // The new page's results replace the old ones.
      await page
        .waitForFunction((prev) => document.querySelector('button[aria-label^="Dismiss "][aria-label$=" job"]')?.getAttribute("aria-label") !== prev, firstBefore, { timeout: 15_000 })
        .catch(() => undefined);
      const stopped = await linkedinBlocked(page);
      if (stopped) return { jobs, blocked: stopped };
    }
    const onPage = await cards.count();
    total += onPage;
    if (onPage === 0) break;
    const reached = await readPage(onPage);
    if (reached) return { jobs, blocked: reached };
  }
  log(`linkedin: ${total} results for "${search.keywords}" (past ${search.maxAgeHours} hours): ${jobs.length} new, ${skipped.known} already known, ${skipped.unread} whose details didn't load, ${skipped.noId} with no job id`);
  return { jobs, blocked: null };

  /** Reads the cards on the page showing; a check or sign-out partway through stops it. */
  async function readPage(onPage: number): Promise<"check" | "signed_out" | null> {
    for (let i = 0; i < onPage && jobs.length < limit; i++) {
      const dismiss = cards.nth(i);
      // The card is the box around its Dismiss button; clicking its title shows the job beside the list.
      const card = dismiss.locator("xpath=ancestor::*[.//text()[contains(., 'Easy Apply')]][1]");
      const before = page.url();
      const shown = /currentJobId=(\d+)/.exec(before)?.[1];
      const titleBefore = await page.title();
      await card.scrollIntoViewIfNeeded().catch(() => undefined);
      await pause(page, pace);
      await card.click({ position: { x: 120, y: 20 } }).catch(() => undefined);
      await page.waitForFunction((prev) => location.href !== prev, before, { timeout: 8000 }).catch(() => undefined);
      const id = /currentJobId=(\d+)/.exec(page.url())?.[1];
      if (!id) {
        skipped.noId++;
        continue;
      }
      if (seen.has(id) || jobs.some((j) => j.id === id)) {
        skipped.known++;
        continue;
      }
      // The job's details load beside the list after the address changes: its own title in the page's title
      // (unless it was the one showing already), its Easy Apply button and its description.
      const ready = await page
        .waitForFunction(
          ({ titleBefore, same }) =>
            (same || document.title !== titleBefore) &&
            /\|\s*LinkedIn\s*$/.test(document.title) &&
            !!document.querySelector('[aria-label="Easy Apply to this job"]') &&
            [...document.querySelectorAll("h2")].some((h) => /about the job/i.test(h.textContent ?? "")),
          { titleBefore, same: shown === id },
          { timeout: 10_000 },
        )
        .then(() => true, () => false);
      if (!ready) {
        skipped.unread++;
        continue;
      }
      const read = await page.evaluate(() => {
        const about = [...document.querySelectorAll("h2")].find((h) => /about the job/i.test(h.textContent ?? ""));
        let box = about as HTMLElement | null | undefined;
        for (let k = 0; k < 4 && box; k++) {
          box = box.parentElement;
          if ((box?.innerText.length ?? 0) > 300) break;
        }
        const apply = document.querySelector('[aria-label="Easy Apply to this job"]');
        let head = apply as HTMLElement | null;
        for (let k = 0; k < 8 && head; k++) {
          head = head.parentElement;
          if ((head?.innerText.length ?? 0) > 150) break;
        }
        return { title: document.title, head: head?.innerText ?? "", about: (box?.innerText ?? "").replace(/^about the job\s*/i, ""), easy: !!apply };
      });
      const named = splitPageTitle(read.title);
      if (!named || !read.easy) {
        skipped.unread++;
        continue;
      }
      jobs.push({ id, ...named, ...parseJobHead(read.head, now), description: read.about.slice(0, 40_000) });
      log(`linkedin: found "${named.title}" at ${named.company}`);
      const stopped = await linkedinBlocked(page);
      if (stopped) return stopped;
    }
    return null;
  }
}
