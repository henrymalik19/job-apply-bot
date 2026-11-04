// The apply runner's fallback for required fields the plan didn't cover, against a local Supabase:
//   - Claude's answers are kept only when they fit the field (a listed option, one value for one choice)
//   - agreements never go to Claude; writing and unsure fields are left to you
//   - a value you leave as filled is learned after 2 submits; one you change is learned at once as yours
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { listFieldMappings, mapOpenFields, recordFieldOutcome } from "@/server/modules/apply/field-mapping";
import type { OpenField } from "@/server/modules/apply/apply.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const COMPANY = `fieldco-${Math.random().toString(36).slice(2, 8)}`;
let userId = "";
let cleanupUser = async () => {};

const fields: OpenField[] = [
  { key: "company-name-0", label: "Company name", kind: "text", options: [] },
  { key: "start-month", label: "Start date month", kind: "select", options: ["January", "March"] },
  { key: "why", label: "Why us?", kind: "textarea", options: [] },
  { key: "certify", label: "I certify this is true", kind: "agreement", options: ["Yes"] },
  { key: "school", label: "School", kind: "select", options: ["Georgia Tech"] },
];
const prompts: string[] = [];
// Claude: the company and month are facts; the essay is writing; the school answer isn't an option.
const call: StructuredCall = async ({ user }) => {
  prompts.push(user);
  return {
    output: {
      answers: [
        { index: 0, category: "fact", value: ["Acme"], reason: "current employer" },
        { index: 1, category: "fact", value: ["March"], reason: "started March 2021" },
        { index: 2, category: "free_text", value: [], reason: "asks for writing" },
        { index: 3, category: "fact", value: ["MIT"], reason: "studied at MIT" },
      ],
    } as never,
    model: "claude-haiku-5-5",
    usage: { input_tokens: 400, output_tokens: 80 },
  };
};

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
});

afterAll(async () => {
  await db.from("field_mappings").delete().eq("user_id", userId).eq("company", COMPANY);
  await db.from("llm_calls").delete().eq("user_id", userId).eq("purpose", "map_fields");
  await cleanupUser();
});

describe("open field fallback", () => {
  it("keeps only answers that fit, never asks about an agreement, and leaves the rest to you", async () => {
    const answers = await mapOpenFields(db, userId, call, { company: "Fieldco", title: "Engineer", fields });
    const by = new Map(answers.map((a) => [a.key, a]));
    expect(by.get("company-name-0")).toMatchObject({ value: ["Acme"], category: "fact" });
    expect(by.get("start-month")).toMatchObject({ value: ["March"], category: "fact" });
    expect(by.get("why")).toMatchObject({ value: null, category: "free_text" });
    expect(by.get("certify")).toMatchObject({ value: null, category: "agreement" });
    // "MIT" isn't one of the field's options.
    expect(by.get("school")).toMatchObject({ value: null, category: "unsure" });
    expect(prompts.at(-1)).not.toContain("I certify");
  });

  it("learns a value you leave as filled after 2 submits, and yours at once when you change it", async () => {
    const where = { ats: "greenhouse", company: COMPANY };
    const kept = { fieldName: "company-name-0", label: "Company name", filled: ["Acme"], final: "Acme" };
    await recordFieldOutcome(db, userId, where, kept, undefined);
    let mappings = await listFieldMappings(db, userId, "greenhouse", COMPANY);
    expect(mappings.get("company-name-0")).toMatchObject({ confirmations: 1, learned: false, source: "ai" });
    await recordFieldOutcome(db, userId, where, kept, mappings.get("company-name-0"));
    mappings = await listFieldMappings(db, userId, "greenhouse", COMPANY);
    expect(mappings.get("company-name-0")).toMatchObject({ confirmations: 2, learned: true, value: ["Acme"] });

    await recordFieldOutcome(db, userId, where, { fieldName: "start-month", label: "Start date month", filled: ["March"], final: "January" }, undefined);
    mappings = await listFieldMappings(db, userId, "greenhouse", COMPANY);
    expect(mappings.get("start-month")).toMatchObject({ learned: true, source: "you", value: ["January"] });
  });
});
