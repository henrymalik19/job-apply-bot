// The Lever driver against a fixture page with the live form's structure, in headless Chrome,
// including Lever's habit of overwriting fields from an uploaded resume. Skipped without Chrome (CI).
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FillStep } from "@/server/modules/apply/fill-plan";
import { leverDriver } from "./lever-driver";
import { INSTANT } from "./human";

const FIXTURE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "lever-fixture.html")).href;
const browser: Browser | null = await chromium.launch({ channel: "chrome", headless: true }).catch(() => null);
let page: Page;
const resume = path.join(tmpdir(), "lever-test-resume.pdf");

beforeAll(async () => {
  if (!browser) return;
  await writeFile(resume, "%PDF-1.4");
  page = await browser.newPage();
});
afterAll(async () => browser?.close());

const step = (s: Partial<FillStep> & Pick<FillStep, "kind" | "fieldName">): FillStep => ({ label: s.fieldName, required: true, ...s }) as FillStep;

describe.skipIf(!browser)("leverDriver", () => {
  it("waits out the resume's autofill, then fills every field over it", async () => {
    const driver = leverDriver(page, 15_000, 45_000, INSTANT);
    expect(await driver.open(FIXTURE)).toBe("ok");
    const steps: FillStep[] = [
      step({ kind: "resume", fieldName: "resume" }),
      step({ kind: "text", fieldName: "name", value: "Ada Lovelace" }),
      step({ kind: "text", fieldName: "email", value: "ada@example.test" }),
      step({ kind: "text", fieldName: "location", value: "Atlanta, GA" }),
      step({ kind: "text", fieldName: "org", value: "Analytical Engines" }),
      step({ kind: "select", fieldName: "cards[c1][field0]", value: ["Company website"] }),
      step({ kind: "select", fieldName: "cards[c1][field1]", value: ["Yes"] }),
      step({ kind: "select", fieldName: "cards[c2][field0]", value: ["English", "Spanish"] }),
      step({ kind: "text", fieldName: "cards[c2][field1]", value: "Because." }),
    ];
    for (const s of steps) expect(await driver.fill(s, resume), s.fieldName).toBe(true);
    // Nothing from the resume's autofill ("Jordan Sample", "Denver") survives.
    await page.waitForTimeout(1000);
    expect(await driver.values(steps)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.test",
      location: "Atlanta, GA, USA",
      org: "Analytical Engines",
      "cards[c1][field0]": "Company website",
      "cards[c1][field1]": "Yes",
      "cards[c2][field0]": "English, Spanish",
      "cards[c2][field1]": "Because.",
    });
    expect(await page.inputValue('[name="selectedLocation"]')).toContain("Atlanta, GA, USA");
  }, 60_000);

  it("leaves a survey hidden for another region alone, and reports options that aren't there", async () => {
    const driver = leverDriver(page, 15_000, 45_000, INSTANT);
    await driver.open(FIXTURE);
    const survey = "surveysResponses[s1][responses][field0]";
    expect(await driver.has!(survey)).toBe(false);
    expect(await driver.fill(step({ kind: "decline", fieldName: survey }), resume)).toBe(false);
    expect(await page.isChecked(`[name="${survey}"][value="Prefer not to disclose"]`)).toBe(false);
    expect(await driver.fill(step({ kind: "select", fieldName: "cards[c1][field0]", value: ["Billboard"] }), resume)).toBe(false);
    expect(await driver.fill(step({ kind: "text", fieldName: "location", value: "Nowhere, ZZ" }), resume)).toBe(false);
    expect(await driver.has!("name")).toBe(true);
  }, 60_000);

  it("submits and reads the thank-you page", async () => {
    const driver = leverDriver(page, 15_000, 45_000, INSTANT);
    await driver.open(FIXTURE);
    expect(await driver.confirmation()).toBeNull();
    // The required fields, so the browser lets the form submit.
    await page.fill('[name="name"]', "Ada Lovelace");
    await page.fill('[name="email"]', "ada@example.test");
    await page.fill('[name="location"]', "Atlanta, GA, USA");
    await driver.submit();
    await page.waitForSelector("text=Application submitted");
    expect(await driver.confirmation()).toMatch(/Application submitted/);
  }, 30_000);
});
