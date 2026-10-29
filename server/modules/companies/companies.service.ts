import { z } from "zod";
import type { Db } from "@/server/db/types";
import { parseKeywords, TITLE_FILTER_KEY, titleFilterSchema, type TitleFilter } from "./title-filter";
import { BOARD_ATS, BOARD_TOKEN, boardUrl, parseBoard } from "@/server/integrations/ats/boards";
import { fetchJson } from "@/server/integrations/ats/http";
import * as companies from "./companies.repository";
import { RepositoryError } from "@/server/core/errors";
import * as settings from "@/server/modules/settings/settings.service";
import { ValidationError } from "@/server/core/errors";

const boardInput = z.object({
  ats: z.enum(BOARD_ATS, { message: "Pick an ATS." }),
  board_token: z.string().trim().regex(BOARD_TOKEN, "Board token: letters, numbers, dots, dashes or underscores."),
});

const companyInput = boardInput.extend({
  name: z.string().trim().min(1, "Enter the company name.").max(200),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
});

/** Raw form values for a board (strings straight from the form). */
export type BoardInput = { ats?: unknown; board_token?: unknown };
/** Raw form values for a company. */
export type CompanyInput = BoardInput & { name?: unknown; priority?: unknown };

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
export { passesTitleFilter, type TitleFilter } from "./title-filter";

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

/**
 * Adds a company board. Discovery picks it up on the next run.
 *
 * @returns The trimmed company name.
 * @throws {@link ValidationError} for bad input or a board that already exists.
 */
export async function addCompany(db: Db, input: CompanyInput): Promise<string> {
  const company = validate(companyInput, input);
  try {
    await companies.insertCompany(db, company);
  } catch (err) {
    if (err instanceof RepositoryError && err.isDuplicate) throw new ValidationError("That board is already added.");
    throw err;
  }
  return company.name;
}

/** Pauses or resumes a company's board. */
export async function setCompanyActive(db: Db, id: string, active: boolean): Promise<void> {
  await companies.setCompanyActive(db, z.string().uuid().parse(id), active);
}

/** The current title filter (empty lists when unset). */
export async function getTitleFilter(db: Db): Promise<TitleFilter> {
  return titleFilterSchema.parse((await settings.getSetting(db, TITLE_FILTER_KEY)) ?? {});
}

/**
 * Saves the title filter from comma- or newline-separated phrase lists.
 * Applies to jobs found from the next discovery run on.
 */
export async function saveTitleFilter(db: Db, include: string, exclude: string): Promise<TitleFilter> {
  const filter = { include: parseKeywords(include), exclude: parseKeywords(exclude) };
  await settings.putSetting(db, TITLE_FILTER_KEY, filter);
  return filter;
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
  exported: z.infer<typeof exportedCompanySchema>[],
  excludeNames: string[],
): Promise<{ imported: number; invalidTokens: string[] }> {
  const exclude = new Set(excludeNames.map((n) => n.toLowerCase()));
  const wanted = exported.filter((c) => c.remote_fit_roles > 0 && !exclude.has(c.name.toLowerCase()));
  const invalidTokens = wanted.filter((c) => !BOARD_TOKEN.test(c.board_token)).map((c) => c.board_token);
  const rows = wanted
    .filter((c) => BOARD_TOKEN.test(c.board_token))
    .map((c) => ({ name: c.name, ats: c.ats, board_token: c.board_token, priority: Math.min(c.remote_fit_roles, 100) }));
  await companies.upsertCompanies(db, rows);
  return { imported: rows.length, invalidTokens };
}
