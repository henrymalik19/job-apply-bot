// M3 acceptance: the public page reads only public_status fields, hides
// pre-submission applications, and is off (null → 404) unless enabled.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/server/modules/applications/applications.service";
import { getPublicPage, PUBLIC_PAGE_KEY } from "@/server/modules/public-page/public-page.service";
import type { Db } from "@/server/db/types";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const service = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
const jobIds: string[] = [];
let previous: unknown;

async function application(title: string) {
  const key = `${tag}-${title}`;
  const { data: job, error } = await service
    .from("jobs")
    .insert({ company_name: `PubCo ${tag}`, source: "greenhouse", external_id: key, url: `https://example.test/${key}`, title, dedup_key: key, description_md: "SECRET DESCRIPTION" })
    .select("id")
    .single();
  if (error) throw error;
  jobIds.push(job.id);
  const { data: app, error: appErr } = await service.from("applications").insert({ job_id: job.id, cover_letter: "SECRET LETTER" }).select("id").single();
  if (appErr) throw appErr;
  return app.id;
}

beforeAll(async () => {
  const { data } = await service.from("settings").select("value").eq("key", PUBLIC_PAGE_KEY).maybeSingle();
  previous = data?.value ?? false;
  const sent = await application("Sent Role");
  await transition(service, sent, "approved", "user:approve");
  await transition(service, sent, "submitted", "user:submit");
  await application("Queued Role");
});

afterAll(async () => {
  await service.from("applications").delete().in("job_id", jobIds);
  await service.from("jobs").delete().in("id", jobIds);
  await service.from("settings").upsert({ key: PUBLIC_PAGE_KEY, value: previous as boolean });
});

describe("public page", () => {
  it("is off (null → 404) when the setting is false", async () => {
    await service.from("settings").upsert({ key: PUBLIC_PAGE_KEY, value: false });
    expect(await getPublicPage(service, new Date())).toBeNull();
  });

  it("shows submitted applications with only public fields, and hides queued ones", async () => {
    await service.from("settings").upsert({ key: PUBLIC_PAGE_KEY, value: true });
    const page = await getPublicPage(service, new Date());
    expect(page).not.toBeNull();
    const mine = page!.applications.filter((a) => a.company_name === `PubCo ${tag}`);
    expect(mine.map((a) => a.job_title)).toEqual(["Sent Role"]);
    for (const a of page!.applications) {
      expect(Object.keys(a).sort()).toEqual(["company_name", "job_title", "last_status_at", "status", "submitted_at"]);
    }
    expect(JSON.stringify(page)).not.toMatch(/SECRET/);
    expect(page!.counts.find((c) => c.label === "Applications sent")!.value).toBeGreaterThanOrEqual(1);
    expect(page!.sentPerDay).toHaveLength(30);
    expect(page!.sentPerDay.at(-1)!.count).toBeGreaterThanOrEqual(1);
  });
});
