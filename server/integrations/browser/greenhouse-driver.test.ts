// The Greenhouse driver against a fixture page with the live form's structure,
// in headless Chrome. Skipped where Chrome isn't installed (CI).
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFillPlan } from "@/server/modules/apply/fill-plan";
import { greenhouseDriver } from "./greenhouse-driver";

const FIXTURE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "greenhouse-fixture.html")).href;
const browser: Browser | null = await chromium.launch({ channel: "chrome", headless: true }).catch(() => null);
let page: Page;
const resume = path.join(tmpdir(), "driver-test-resume.pdf");

beforeAll(async () => {
  if (!browser) return;
  await writeFile(resume, "%PDF-1.4");
  page = await browser.newPage();
});
afterAll(async () => browser?.close());

const plan = buildFillPlan([
  { question: "First Name", field_name: "first_name", field_type: "text", options: null, required: true, answer: "Ada", answer_value: "Ada" },
  { question: "Why us?", field_name: "question_1", field_type: "textarea", options: null, required: false, answer: "Because.", answer_value: "Because." },
  { question: "Resume/CV", field_name: "resume", field_type: "file", options: null, required: true, answer: "Tailored resume (PDF)", answer_value: null },
  {
    question: "Sponsorship?", field_name: "question_2", field_type: "select", required: true, answer: "No", answer_value: "1",
    options: [{ label: "No", value: "1" }, { label: "Yes, Netherlands Highly Skilled Migrant Visa", value: "2" }],
  },
  {
    question: "Languages", field_name: "question_3", field_type: "multiselect", required: false, answer: "Go, Rust", answer_value: ["a", "b"],
    options: [{ label: "Go", value: "a" }, { label: "Rust", value: "b" }],
  },
]);

describe.skipIf(!browser)("greenhouseDriver", () => {
  it("fills text, picks options, attaches the resume and reads the values back", async () => {
    const driver = greenhouseDriver(page);
    expect(await driver.open(FIXTURE)).toBe("ok");
    for (const step of plan.steps) expect(await driver.fill(step, resume), step.label).toBe(true);
    expect(await page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe("driver-test-resume.pdf");
    expect(await driver.values(plan.steps)).toEqual({ first_name: "Ada", question_1: "Because.", question_2: "No", question_3: "Rust, Go" });
    expect(await driver.challenge()).toBe(false);
    expect(await driver.confirmation()).toBeNull();
  });

  it("reports an option that isn't on the form", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    expect(await driver.fill({ kind: "select", fieldName: "question_2", label: "Sponsorship?", required: true, value: ["Maybe"] }, resume)).toBe(false);
    expect(await driver.fill({ kind: "text", fieldName: "question_404", label: "Gone", required: true, value: "x" }, resume)).toBe(false);
  });

  it("sees the thank-you page after submit", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    await driver.submit();
    expect(await driver.confirmation()).toContain("Thank you for applying");
  });

  it("finds no form on a page without one", async () => {
    const driver = greenhouseDriver(page, 500);
    expect(await driver.open("data:text/html,<p>This job is no longer accepting applications.</p>")).toBe("no_form");
  });
});
