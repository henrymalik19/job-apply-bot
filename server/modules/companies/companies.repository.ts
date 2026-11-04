import type { BoardAts } from "@/server/integrations/ats/boards";
import { BOARD_ATS } from "@/server/integrations/ats/boards";
import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap, ValidationError } from "@/server/core/errors";

/** A row of `companies`. */
export type Company = Row<"companies">;

/** An active company whose board the discover worker can read. */
export type BoardCompany = { id: string; name: string; ats: BoardAts; board_token: string };

/** Fields for adding a company. */
export type NewCompany = Pick<Insert<"companies">, "name" | "ats" | "board_token">;

/** The companies a user follows: active first, then by name. */
export async function listCompanies(db: Db, userId: string): Promise<Company[]> {
  const rows = unwrap(
    await db
      .from("companies")
      .select("*, user_companies!inner(user_id)")
      .eq("user_companies.user_id", userId)
      .order("active", { ascending: false })
      .order("name"),
    "list companies",
  );
  return rows.map(({ user_companies: _follows, ...c }) => c);
}

/**
 * Active companies someone follows, on a supported ATS with a board token, by name.
 *
 * @param onlyIds - Restrict to these company ids (used by tests).
 */
export async function listActiveBoards(db: Db, onlyIds?: string[]): Promise<BoardCompany[]> {
  let query = db
    .from("companies")
    .select("id, name, ats, board_token, user_companies!inner(user_id)")
    .eq("active", true)
    .in("ats", [...BOARD_ATS])
    .not("board_token", "is", null)
    .order("name");
  if (onlyIds) query = query.in("id", onlyIds);
  const rows = unwrap(await query, "list active boards");
  // One row per company (the follow embed can repeat it).
  return [...new Map(rows.map(({ user_companies: _follows, ...c }) => [c.id, c as BoardCompany])).values()];
}

/** Adds a company unless its board exists, and returns its id either way. */
export async function ensureCompany(db: Db, company: NewCompany): Promise<string> {
  check(await db.from("companies").upsert(company, { onConflict: "ats,board_token", ignoreDuplicates: true }), "add company");
  return unwrap(
    await db.from("companies").select("id").eq("ats", company.ats).eq("board_token", company.board_token ?? "").single(),
    "read company",
  ).id;
}

/**
 * Makes a user follow companies.
 *
 * @returns How many follows were new.
 */
export async function followCompanies(db: Db, userId: string, companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  const rows = unwrap(
    await db
      .from("user_companies")
      .upsert(companyIds.map((company_id) => ({ user_id: userId, company_id })), { onConflict: "user_id,company_id", ignoreDuplicates: true })
      .select("company_id"),
    "follow companies",
  );
  return rows.length;
}

/** Moves a company to another board and closes its open jobs from the old one. */
export async function switchBoard(db: Db, id: string, board: { ats: string; board_token: string }): Promise<{ closed: number }> {
  const company = unwrap(await db.from("companies").select("ats, board_token").eq("id", id).single(), "get company");
  const taken = unwrap(await db.from("companies").select("id").eq("ats", board.ats).eq("board_token", board.board_token).neq("id", id), "find board");
  if (taken.length) throw new ValidationError("Another company already has that board; turn this one off instead.");
  check(await db.from("companies").update({ ats: board.ats, board_token: board.board_token, active: true }).eq("id", id), "switch board");
  const closed = unwrap(
    await db.from("jobs").update({ closed_at: new Date().toISOString() }).eq("company_id", id).eq("source", company.ats).is("closed_at", null).select("id"),
    "close old board's jobs",
  );
  return { closed: closed.length };
}

/** Pauses (`false`) or resumes (`true`) a company's board. */
export async function setCompanyActive(db: Db, id: string, active: boolean): Promise<void> {
  check(await db.from("companies").update({ active }).eq("id", id), "update company");
}

/**
 * Inserts companies or updates the name of existing ones, matched on
 * `(ats, board_token)`. Leaves `active` untouched so paused boards stay paused.
 */
export async function upsertCompanies(db: Db, companies: NewCompany[]): Promise<string[]> {
  return unwrap(await db.from("companies").upsert(companies, { onConflict: "ats,board_token" }).select("id"), "upsert companies").map((c) => c.id);
}
