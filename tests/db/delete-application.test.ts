// Removing an application so it's prepared again takes its files in storage with it, against a local Supabase.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { deleteApplication } from "@/server/modules/prepare/prepare.repository";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let jobId = "";
const bytes = new TextEncoder().encode("test");

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `Delco ${tag}`, source: "ashby", external_id: `${tag}del`, url: `https://example.test/${tag}/del`, title: "Engineer", dedup_key: `${tag}-del` })
    .select("id")
    .single();
  jobId = job!.id;
});

afterAll(async () => {
  await db.from("applications").delete().eq("job_id", jobId);
  await db.from("jobs").delete().eq("id", jobId);
  await cleanupUser();
});

const exists = async (bucket: string, path: string) => {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const { data } = await db.storage.from(bucket).list(folder);
  return (data ?? []).some((f) => f.name === path.slice(path.lastIndexOf("/") + 1));
};

describe("deleting an application", () => {
  it("removes its resume PDF, screenshots and runner files", async () => {
    const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: jobId, status: "skipped" }).select("id").single();
    const id = app!.id;
    const resume = `${userId}/${id}/resume.pdf`;
    const shot = `${userId}/${id}/screenshot.png`;
    const folder = `${userId}/${id}/${randomUUID()}`;
    await db.storage.from("resumes").upload(resume, bytes, { contentType: "application/pdf" });
    await db.storage.from("evidence").upload(shot, bytes, { contentType: "image/png" });
    await db.storage.from("apply-runs").upload(`${folder}/run.log`, bytes, { contentType: "text/plain" });
    await db.from("resumes").insert({ user_id: userId, application_id: id, kind: "tailored", label: tag, content: {}, pdf_path: resume });
    await db.from("application_evidence_items").insert({ application_id: id, kind: "screenshot", storage_path: shot });
    await db.from("apply_runs").insert({ user_id: userId, application_id: id, started_at: new Date().toISOString(), outcome: "submitted", folder, files: ["run.log"] });
    expect(await exists("resumes", resume)).toBe(true);

    await deleteApplication(db, id);
    expect((await db.from("applications").select("id").eq("id", id)).data).toEqual([]);
    expect(await exists("resumes", resume)).toBe(false);
    expect(await exists("evidence", shot)).toBe(false);
    expect(await exists("apply-runs", `${folder}/run.log`)).toBe(false);
  });
});
