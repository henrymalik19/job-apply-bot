// Switching a company to the board it moved to (Health > "Moved to Ashby"):
//   - the company follows the new board, turned on
//   - its open jobs from the old board close; ones on other sources don't
//   - a board another company already has is refused
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { switchBoard } from "@/server/modules/companies/companies.repository";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
const companyIds: string[] = [];
const jobIds: Record<string, string> = {};

async function addJob(key: string, companyId: string, source: string) {
  const { data } = await db
    .from("jobs")
    .insert({ company_id: companyId, company_name: `Movedco ${tag}`, source, external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: key, dedup_key: `${tag}-switch-${key}` })
    .select("id")
    .single();
  jobIds[key] = data!.id;
}

beforeAll(async () => {
  const { data: moved } = await db.from("companies").insert({ name: `Movedco ${tag}`, ats: "greenhouse", board_token: `moved${tag}`, active: false }).select("id").single();
  const { data: other } = await db.from("companies").insert({ name: `Otherco ${tag}`, ats: "lever", board_token: `taken${tag}` }).select("id").single();
  companyIds.push(moved!.id, other!.id);
  await addJob("open", moved!.id, "greenhouse");
  await addJob("ashbyjob", moved!.id, "ashby");
});

afterAll(async () => {
  await db.from("jobs").delete().in("id", Object.values(jobIds));
  await db.from("companies").delete().in("id", companyIds);
});

describe("switchBoard", () => {
  it("follows the new board and closes the old board's open jobs", async () => {
    expect(await switchBoard(db, companyIds[0], { ats: "ashby", board_token: `moved${tag}` })).toEqual({ closed: 1 });
    const { data: company } = await db.from("companies").select("ats, board_token, active").eq("id", companyIds[0]).single();
    expect(company).toEqual({ ats: "ashby", board_token: `moved${tag}`, active: true });
    const { data: jobs } = await db.from("jobs").select("id, closed_at").in("id", Object.values(jobIds));
    const closed = new Map(jobs!.map((j) => [j.id, j.closed_at != null]));
    expect(closed.get(jobIds.open)).toBe(true);
    expect(closed.get(jobIds.ashbyjob)).toBe(false);
  });

  it("refuses a board another company already has", async () => {
    await expect(switchBoard(db, companyIds[0], { ats: "lever", board_token: `taken${tag}` })).rejects.toThrow(/Another company already has that board/);
  });
});
