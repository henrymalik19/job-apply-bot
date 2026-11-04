import { z } from "zod";
import type { Db } from "@/server/db/types";
import { BOARD_ATS, BOARD_TOKEN, boardUrl, parseBoard, type BoardAts } from "@/server/integrations/ats/boards";
import { fetchJson } from "@/server/integrations/ats/http";
import * as companies from "./companies.repository";
import { ValidationError } from "@/server/core/errors";

const boardInput = z.object({
  ats: z.enum(BOARD_ATS, { message: "Pick an ATS." }),
  board_token: z.string().trim().regex(BOARD_TOKEN, "Board token: letters, numbers, dots, dashes or underscores."),
});

const companyInput = boardInput.extend({
  name: z.string().trim().min(1, "Enter the company name.").max(200),
});

/** Raw form values for a board (strings straight from the form). */
export type BoardInput = { ats?: unknown; board_token?: unknown };
/** Raw form values for a company. */
export type CompanyInput = BoardInput & { name?: unknown };

/** Result of checking a board before adding it. */
export type BoardCheck = { count: number; sampleTitles: string[] };

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

export {
  listActiveBoards,
  listCompanies,
  type BoardCompany,
  type Company,
} from "./companies.repository";

/**
 * Fetches a board once (no retries) to confirm the token works.
 *
 * @returns How many jobs are open and up to five titles.
 * @throws {@link ValidationError} for bad input, an unknown board or a failed fetch.
 */
export async function testBoard(input: BoardInput): Promise<BoardCheck> {
  const { ats, board_token } = validate(boardInput, input);
  try {
    const jobs = parseBoard(ats, await fetchJson(boardUrl(ats, board_token), { attempts: 1, timeoutMs: 15_000 }));
    return { count: jobs.length, sampleTitles: jobs.slice(0, 5).map((j) => j.title) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ValidationError(/404/.test(message) ? "No board found for that token." : `Board check failed: ${message}`);
  }
}

/** A board found for a company name or URL. */
export type FoundBoard = { ats: BoardAts; board_token: string; count: number; sampleTitles: string[] };

// Host of each ATS's public board pages; the board token is the first path segment.
const BOARD_HOSTS: [RegExp, BoardAts][] = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"],
  [/^jobs\.lever\.co$/, "lever"],
  [/^jobs\.ashbyhq\.com$/, "ashby"],
];

/**
 * Reads the ATS and board token from a job-board URL, e.g.
 * job-boards.greenhouse.io/stripe or jobs.ashbyhq.com/ramp/123. Greenhouse
 * embed links carry the token in `for=`.
 *
 * @returns The board, or null when the text isn't a board URL.
 */
export function parseBoardUrl(text: string): { ats: BoardAts; board_token: string } | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text.trim()) ? text.trim() : `https://${text.trim()}`);
  } catch {
    return null;
  }
  const ats = BOARD_HOSTS.find(([host]) => host.test(url.hostname.toLowerCase()))?.[1];
  if (!ats) return null;
  const token = url.searchParams.get("for") ?? url.pathname.split("/").filter(Boolean).find((s) => s !== "embed");
  return token && BOARD_TOKEN.test(token) ? { ats, board_token: token } : null;
}

/** Likely board tokens for a company name: "Scale AI" gives scaleai, scale-ai and scale. */
export function guessTokens(name: string): string[] {
  const words = name.toLowerCase().replace(/&/g, " and ").replace(/\b(inc|llc|ltd|corp|co|the)\b\.?/g, " ").match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return [];
  return [...new Set([words.join(""), words.join("-"), ...words.slice(0, 1)])];
}

/**
 * Finds a company's job board from its name or a board URL. A URL is checked as
 * is; a name is tried as a few likely tokens on every supported ATS at once.
 *
 * @param query - A company name or a job-board URL.
 * @param fetchFn - Injected fetch (tests).
 * @returns Every board that answered with at least one open job, most jobs first.
 */
export async function findBoards(query: string, fetchFn?: typeof fetch): Promise<FoundBoard[]> {
  const fromUrl = parseBoardUrl(query);
  const candidates = fromUrl
    ? [fromUrl]
    : guessTokens(query).flatMap((board_token) => BOARD_ATS.map((ats) => ({ ats, board_token })));
  const found = await checkBoards(candidates, fetchFn);
  // A name's first word alone can hit an unrelated company's empty board; keep boards with jobs.
  return found.filter((b) => fromUrl != null || b.count > 0);
}

/** Fetches each board once; the ones that answered, most jobs first. */
async function checkBoards(candidates: { ats: BoardAts; board_token: string }[], fetchFn?: typeof fetch): Promise<FoundBoard[]> {
  const found = await Promise.all(
    candidates.map(async ({ ats, board_token }) => {
      try {
        const jobs = parseBoard(ats, await fetchJson(boardUrl(ats, board_token), { attempts: 1, timeoutMs: 10_000, fetchFn }));
        return { ats, board_token, count: jobs.length, sampleTitles: jobs.slice(0, 3).map((j) => j.title) };
      } catch {
        return null;
      }
    }),
  );
  return found.filter((b): b is FoundBoard => b != null).sort((a, b) => b.count - a.count);
}

/**
 * Where a company's board went when its own is gone (a 404): the same token on the other
 * ATSes, then boards found by its name. Companies switch ATS now and then (Doctolib went
 * from Greenhouse to Ashby).
 *
 * @returns The board with the most open jobs that isn't the current one, or null.
 */
export async function findMovedBoard(
  company: { name: string; ats: string; board_token: string },
  fetchFn?: typeof fetch,
): Promise<FoundBoard | null> {
  const isCurrent = (b: { ats: string; board_token: string }) => b.ats === company.ats && b.board_token === company.board_token;
  const sameToken = BOARD_ATS.map((ats) => ({ ats, board_token: company.board_token }));
  const byName = guessTokens(company.name).flatMap((board_token) => BOARD_ATS.map((ats) => ({ ats, board_token })));
  const seen = new Set<string>();
  const candidates = [...sameToken, ...byName].filter((b) => {
    const key = `${b.ats}:${b.board_token}`;
    if (isCurrent(b) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (await checkBoards(candidates, fetchFn)).find((b) => b.count > 0) ?? null;
}

/**
 * Points a company at its new board after it moved ATS. Its jobs from the old board are
 * closed (that board is gone), so applications not yet sent for them expire as usual;
 * discovery reads the new board on its next run.
 *
 * @throws {@link ValidationError} for a bad board, one that doesn't answer, or one another company already has.
 */
export async function switchBoard(db: Db, companyId: string, input: BoardInput): Promise<{ closed: number }> {
  const id = z.string().uuid().parse(companyId);
  const board = validate(boardInput, input);
  await testBoard(board);
  return companies.switchBoard(db, id, board);
}

/**
 * Follows a company board, adding it to the shared list if it's new.
 * Discovery picks it up on the next run.
 *
 * @returns The trimmed company name.
 * @throws {@link ValidationError} for bad input or a board the user already follows.
 */
export async function addCompany(db: Db, userId: string, input: CompanyInput): Promise<string> {
  const company = validate(companyInput, input);
  const id = await companies.ensureCompany(db, company);
  if ((await companies.followCompanies(db, userId, [id])) === 0) throw new ValidationError("That board is already added.");
  return company.name;
}

/** Pauses or resumes a company's board. */
export async function setCompanyActive(db: Db, id: string, active: boolean): Promise<void> {
  await companies.setCompanyActive(db, z.string().uuid().parse(id), active);
}

/** A company exported from the old app (`data/old/companies.json`). */
export const exportedCompanySchema = z.object({
  name: z.string(),
  ats: z.enum(BOARD_ATS),
  board_token: z.string(),
  remote_fit_roles: z.number(),
});

/**
 * Imports boards that listed at least one remote role matching the search.
 * Priority is that role count (capped at 100). Existing boards keep their
 * `active` flag, so paused boards stay paused.
 *
 * @param excludeNames - Company names to skip (case-insensitive), e.g. the current employer.
 * @returns How many were imported and which tokens were skipped as invalid.
 */
export async function importCompanies(
  db: Db,
  userId: string,
  exported: z.infer<typeof exportedCompanySchema>[],
  excludeNames: string[],
): Promise<{ imported: number; invalidTokens: string[] }> {
  const exclude = new Set(excludeNames.map((n) => n.toLowerCase()));
  const wanted = exported.filter((c) => c.remote_fit_roles > 0 && !exclude.has(c.name.toLowerCase()));
  const invalidTokens = wanted.filter((c) => !BOARD_TOKEN.test(c.board_token)).map((c) => c.board_token);
  const rows = wanted
    .filter((c) => BOARD_TOKEN.test(c.board_token))
    .map((c) => ({ name: c.name, ats: c.ats, board_token: c.board_token }));
  await companies.followCompanies(db, userId, await companies.upsertCompanies(db, rows));
  return { imported: rows.length, invalidTokens };
}
