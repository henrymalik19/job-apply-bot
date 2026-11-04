// The Greenhouse driver against a fixture page with the live form's structure,
// in headless Chrome. Skipped where Chrome isn't installed (CI).
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFillPlan, type FillStep } from "@/server/modules/apply/fill-plan";
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
    expect(await page.locator(".filename").textContent()).toBe("driver-test-resume.pdf");
    expect(await driver.values(plan.steps)).toEqual({ first_name: "Ada", question_1: "Because.", question_2: "No", question_3: "Rust, Go" });
    expect(await driver.challenge()).toBe(false);
    expect(await driver.confirmation()).toBeNull();
  });

  it("attaches the resume again when the page's uploader wasn't ready", async () => {
    const driver = greenhouseDriver(page);
    expect(await driver.open(`${FIXTURE}?flaky`)).toBe("ok");
    expect(await driver.fill({ kind: "resume", fieldName: "resume", label: "Resume/CV", required: true }, resume)).toBe(true);
    expect(await page.locator(".filename").textContent()).toBe("driver-test-resume.pdf");
  }, 20_000);

  it("finds demographic selects by their number, picks a city and ticks the consent box", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    const steps: FillStep[] = [
      { kind: "select", fieldName: "demographic_29783", label: "Gender", required: true, value: ["I don't wish to answer"] },
      { kind: "location", fieldName: "candidate-location", label: "Location (City)", required: false, value: "Atlanta, Georgia" },
    ];
    for (const step of steps) expect(await driver.fill(step, resume), step.label).toBe(true);
    expect(await driver.values(steps)).toEqual({ demographic_29783: "I don't wish to answer", "candidate-location": "Atlanta, Georgia, United States" });
    expect(await driver.fill({ kind: "location", fieldName: "candidate-location", label: "Location (City)", required: false, value: "Atlanta, Ohio" }, resume)).toBe(false);
    const consent: FillStep = { kind: "check", fieldName: "gdpr_demographic_data_consent_given", label: "Consent", required: false, value: true };
    expect(await driver.fill(consent, resume)).toBe(true);
    expect(await page.locator("#gdpr_demographic_data_consent_given_1").isChecked()).toBe(true);
    // The decline option, whatever this form calls it; a field the form lacks isn't filled.
    expect(await driver.fill({ kind: "decline", fieldName: "gender", label: "Gender", required: false }, resume)).toBe(true);
    expect(await page.locator("#gender").locator("xpath=ancestor::div[contains(@class,'select__control')]").innerText()).toContain("Decline To Self Identify");
    expect(await driver.fill({ kind: "decline", fieldName: "disability_status", label: "Disability", required: false }, resume)).toBe(false);
    // The closest school, after the full name finds nothing; nothing close enough picks nothing.
    expect(await driver.fill({ kind: "closest", fieldName: "school--0", label: "School", required: false, value: "Georgia State Univ" }, resume)).toBe(true);
    expect(await driver.values([{ kind: "closest", fieldName: "school--0", label: "School", required: false, value: "x" }])).toEqual({ "school--0": "Georgia State University" });
    expect(await driver.fill({ kind: "closest", fieldName: "school--0", label: "School", required: false, value: "Stanford University" }, resume)).toBe(false);
  }, 30_000);

  it("tells a field the form has from one it doesn't", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    expect(await driver.has!("first_name")).toBe(true);
    expect(await driver.has!("resume")).toBe(true);
    expect(await driver.has!("gdpr_demographic_data_consent_given")).toBe(true);
    expect(await driver.has!("race")).toBe(false);
  });

  it("reports an option that isn't on the form", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    expect(await driver.fill({ kind: "select", fieldName: "question_2", label: "Sponsorship?", required: true, value: ["Maybe"] }, resume)).toBe(false);
    expect(await driver.fill({ kind: "text", fieldName: "question_404", label: "Gone", required: true, value: "x" }, resume)).toBe(false);
  });

  it("notices the form asking for a code it emailed", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(`${FIXTURE}?code`);
    expect(await driver.emailCode()).toBe(false);
    await driver.submit();
    expect(await driver.emailCode()).toBe(true);
    expect(await driver.confirmation()).toBeNull();
    expect(await driver.enterEmailCode("aB3dE9fG")).toBe(true);
    expect(await driver.confirmation()).toContain("Thank you for applying");
  });

  it("sees the thank-you page after submit", async () => {
    const driver = greenhouseDriver(page);
    await driver.open(FIXTURE);
    expect(await driver.emailCode()).toBe(false);
    await driver.submit();
    expect(await driver.confirmation()).toContain("Thank you for applying");
  });

  it("finds no form on a page without one", async () => {
    const driver = greenhouseDriver(page, 500);
    expect(await driver.open("data:text/html,<p>This job is no longer accepting applications.</p>")).toBe("no_form");
  });
});
