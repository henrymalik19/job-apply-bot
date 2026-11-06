// Searches LinkedIn for Easy Apply jobs in the runner's own Chrome, where you signed in to LinkedIn yourself.
// Each result carries its job id, so known jobs are skipped; each new one is clicked (at a person's pace) and the job shown
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
  await page.locator(CARD).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const blocked = await linkedinBlocked(page);
  if (blocked) return { jobs: [], blocked };

  const jobs: LinkedInJob[] = [];
  let total = 0;
  // Why results weren't kept, for the log: already known, or the job's details didn't show.
  const skipped = { known: 0, unread: 0 };
  // Page by page (25 results each) until enough new jobs, the last page, or MAX_PAGES.
  for (let pageNo = 1; pageNo <= MAX_PAGES && jobs.length < limit; pageNo++) {
    if (pageNo > 1) {
      const moved = await nextPage(pageNo);
      if (!moved) break;
      const stopped = await linkedinBlocked(page);
      if (stopped) return { jobs, blocked: stopped };
    }
    const ids = await cardIds(page);
    total += ids.length;
    if (ids.length === 0) break;
    const reached = await readPage(ids);
    if (reached) return { jobs, blocked: reached };
  }
  log(`linkedin: ${total} results for "${search.keywords}" (past ${search.maxAgeHours} hours): ${jobs.length} new, ${skipped.known} already known, ${skipped.unread} whose details didn't load`);
  return { jobs, blocked: null };

  /** On to the next page of results: its Next button, or its address when the button isn't there. */
  async function nextPage(pageNo: number): Promise<boolean> {
    const before = (await cardIds(page))[0];
    const next = page.getByRole("button", { name: /^(next|view next page)$/i }).first();
    await pause(page, pace);
    if ((await next.isVisible().catch(() => false)) && !(await next.isDisabled().catch(() => true))) {
      await next.scrollIntoViewIfNeeded().catch(() => undefined);
      await next.click().catch(() => undefined);
    } else {
      const url = new URL(linkedinSearchUrl(search));
      url.searchParams.set("start", String((pageNo - 1) * 25));
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    }
    // The new page's results replace the old ones; none (past the last page) ends the search.
    return page
      .waitForFunction(
        ({ card, prev }) => {
          const first = document.querySelector(card)?.getAttribute("componentkey");
          return !!first && first !== `job-card-component-ref-${prev}`;
        },
        { card: CARD, prev: before },
        { timeout: 15_000 },
      )
      .then(() => true, () => false);
  }

  /** Reads the new jobs on the page showing (known ones are skipped without a click); a check or sign-out stops it. */
  async function readPage(ids: string[]): Promise<"check" | "signed_out" | null> {
    for (const id of ids) {
      if (jobs.length >= limit) break;
      if (seen.has(id) || jobs.some((j) => j.id === id)) {
        skipped.known++;
        continue;
      }
      const shown = /currentJobId=(\d+)/.exec(page.url())?.[1];
      const titleBefore = await page.title();
      if (shown !== id) {
        const card = page.locator(`[componentkey="job-card-component-ref-${id}"]`).first();
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        await pause(page, pace);
        await card.click({ position: { x: 120, y: 20 } }).catch(() => undefined);
      }
      // This job's details, beside the list: its id in the address, its own title in the page's title (unless it
      // was showing already), its Easy Apply button and its description.
      const ready = await page
        .waitForFunction(
          ({ id, titleBefore, same }) =>
            new URLSearchParams(location.search).get("currentJobId") === id &&
            (same || document.title !== titleBefore) &&
            /\|\s*LinkedIn\s*$/.test(document.title) &&
            !!document.querySelector('[aria-label="Easy Apply to this job"]') &&
            [...document.querySelectorAll("h2")].some((h) => /about the job/i.test(h.textContent ?? "")),
          { id, titleBefore, same: shown === id },
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

/** A result in the list: it carries its job id ("job-card-component-ref-4475594226"). */
const CARD = '[componentkey^="job-card-component-ref-"]';

/** The job ids of the results showing, in order (each card has the id on more than one element). */
async function cardIds(page: Page): Promise<string[]> {
  const keys = await page.locator(CARD).evaluateAll((all) => all.map((e) => e.getAttribute("componentkey") ?? ""));
  return [...new Set(keys.map((k) => /(\d{5,})$/.exec(k)?.[1]).filter((id): id is string => !!id))];
}
