// The Ashby driver against a fixture page with the live form's structure, in headless Chrome.
// Skipped where Chrome isn't installed (CI).
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FillStep } from "@/server/modules/apply/fill-plan";
import { ashbyDriver } from "./ashby-driver";

const FIXTURE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "ashby-fixture.html")).href;
const browser: Browser | null = await chromium.launch({ channel: "chrome", headless: true }).catch(() => null);
let page: Page;
const resume = path.join(tmpdir(), "ashby-test-resume.pdf");

beforeAll(async () => {
  if (!browser) return;
  await writeFile(resume, "%PDF-1.4");
  page = await browser.newPage();
});
afterAll(async () => browser?.close());

const step = (s: Partial<FillStep> & Pick<FillStep, "kind" | "fieldName">): FillStep => ({ label: s.fieldName, required: true, ...s }) as FillStep;

describe.skipIf(!browser)("ashbyDriver", () => {
  it("fills text, presses Yes/No, chooses radios and checkboxes, picks a place and attaches the resume", async () => {
    const driver = ashbyDriver(page);
    expect(await driver.open(FIXTURE)).toBe("ok");
    const steps: FillStep[] = [
      step({ kind: "text", fieldName: "_systemfield_name", value: "Ada Lovelace" }),
      step({ kind: "text", fieldName: "_systemfield_email", value: "ada@example.test" }),
      step({ kind: "text", fieldName: "_systemfield_location", value: "Atlanta, Georgia" }),
      step({ kind: "resume", fieldName: "_systemfield_resume" }),
      step({ kind: "select", fieldName: "q-years", value: ["Yes"] }),
      step({ kind: "text", fieldName: "q-why", value: "Because." }),
      step({ kind: "select", fieldName: "q-pronouns", value: ["She/Her"] }),
      step({ kind: "select", fieldName: "q-heard", value: ["LinkedIn", "Company website"] }),
      step({ kind: "decline", fieldName: "_systemfield_eeoc_gender" }),
    ];
    for (const s of steps) expect(await driver.fill(s, resume), s.fieldName).toBe(true);
    expect(await page.inputValue("#loc")).toBe("Atlanta, Georgia, United States");
    expect(await page.locator(".filename").textContent()).toBe("ashby-test-resume.pdf");
    expect(await page.isChecked('[id="s__systemfield_eeoc_gender-labeled-radio-2"]')).toBe(true);
    expect(await driver.values(steps)).toEqual({
      _systemfield_name: "Ada Lovelace",
      _systemfield_email: "ada@example.test",
      _systemfield_location: "Atlanta, Georgia, United States",
      "q-years": "Yes",
      "q-why": "Because.",
      "q-pronouns": "She/Her",
      "q-heard": "LinkedIn, Company website",
    });
  }, 30_000);

  it("reports what isn't there instead of guessing", async () => {
    const driver = ashbyDriver(page);
    await driver.open(FIXTURE);
    expect(await driver.fill(step({ kind: "select", fieldName: "q-pronouns", value: ["Xe/Xem"] }), resume)).toBe(false);
    expect(await driver.fill(step({ kind: "select", fieldName: "q-years", value: ["Maybe"] }), resume)).toBe(false);
    expect(await driver.fill(step({ kind: "text", fieldName: "_systemfield_location", value: "Nowhere, Mars" }), resume)).toBe(false);
    expect(await driver.fill(step({ kind: "text", fieldName: "q-missing", value: "x" }), resume)).toBe(false);
    expect(await driver.has!("q-why")).toBe(true);
    expect(await driver.has!("q-missing")).toBe(false);
  }, 30_000);

  it("submits and reads the thank-you page", async () => {
    const driver = ashbyDriver(page);
    await driver.open(`${FIXTURE}?submit`);
    expect(await driver.confirmation()).toBeNull();
    await driver.submit();
    await page.waitForSelector("text=Thank you for applying");
    expect(await driver.confirmation()).toMatch(/successfully submitted/);
  }, 30_000);
});
