import type { BoardAts } from "@/server/integrations/ats/boards";
import { BOARD_ATS } from "@/server/integrations/ats/boards";
import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A row of `companies`. */
export type Company = Row<"companies">;

/** An active company whose board the discover worker can read. */
export type BoardCompany = { id: string; name: string; ats: BoardAts; board_token: string };

/** Fields for adding a company. */
export type NewCompany = Pick<Insert<"companies">, "name" | "ats" | "board_token" | "priority">;

/** All companies: active first, then by priority (highest first), then name. */
export async function listCompanies(db: Db): Promise<Company[]> {
  return unwrap(
    await db
      .from("companies")
      .select("*")
      .order("active", { ascending: false })
      .order("priority", { ascending: false })
      .order("name"),
    "list companies",
  );
}

/**
 * Active companies on a supported ATS with a board token, highest priority first.
 *
 * @param onlyIds - Restrict to these company ids (used by tests).
 */
export async function listActiveBoards(db: Db, onlyIds?: string[]): Promise<BoardCompany[]> {
  let query = db
    .from("companies")
    .select("id, name, ats, board_token")
    .eq("active", true)
    .in("ats", [...BOARD_ATS])
    .not("board_token", "is", null)
    .order("priority", { ascending: false });
  if (onlyIds) query = query.in("id", onlyIds);
  return unwrap(await query, "list active boards") as BoardCompany[];
}

/**
 * Adds one company.
 *
 * @throws {@link RepositoryError} with `isDuplicate` when the board already exists.
 */
export async function insertCompany(db: Db, company: NewCompany): Promise<void> {
  check(await db.from("companies").insert(company), "insert company");
}

/** Pauses (`false`) or resumes (`true`) a company's board. */
export async function setCompanyActive(db: Db, id: string, active: boolean): Promise<void> {
  check(await db.from("companies").update({ active }).eq("id", id), "update company");
}

/**
 * Inserts companies or updates name/priority of existing ones, matched on
 * `(ats, board_token)`. Leaves `active` untouched so paused boards stay paused.
 */
export async function upsertCompanies(db: Db, companies: NewCompany[]): Promise<void> {
  check(await db.from("companies").upsert(companies, { onConflict: "ats,board_token" }), "upsert companies");
}
