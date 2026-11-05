// Saving a job on Profile > Experience, against a local Supabase: "I work here now" clears an end
// month left in the form.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { saveEmployment } from "@/server/modules/profile/profile.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
let userId = "";
let cleanupUser = async () => {};

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
});

afterAll(async () => {
  await db.from("employments").delete().eq("user_id", userId).eq("employer", "Endco");
  await cleanupUser();
});

describe("saving a job", () => {
  it("clears the end month when it's marked as where you work now", async () => {
    const job = { employer: "Endco", title: "Engineer", start_date: "2022-03", responsibilities: "", skills: "" };
    await saveEmployment(db, userId, { ...job, end_date: "2024-06" });
    const { data: saved } = await db.from("employments").select("id, end_date, is_current").eq("user_id", userId).eq("employer", "Endco").single();
    expect(saved).toMatchObject({ end_date: "2024-06-01", is_current: false });

    await saveEmployment(db, userId, { ...job, end_date: "2024-06", is_current: "on" }, saved!.id);
    const { data: now } = await db.from("employments").select("end_date, is_current").eq("id", saved!.id).single();
    expect(now).toEqual({ end_date: null, is_current: true });
  });
});
