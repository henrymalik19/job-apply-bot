// The LinkedIn driver against a fixture page built like the live Easy Apply form, in headless Chrome.
// Skipped where Chrome isn't installed (CI).
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INSTANT } from "./human";
import { fieldKey, linkedinDriver } from "./linkedin-driver";

const FIXTURE = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "linkedin-fixture.html")).href;
const browser: Browser | null = await chromium.launch({ channel: "chrome", headless: true }).catch(() => null);
let page: Page;
const resume = path.join(tmpdir(), "Ada Lovelace Resume.pdf");

beforeAll(async () => {
  if (!browser) return;
  await writeFile(resume, "%PDF-1.4");
  page = await browser.newPage();
});
afterAll(async () => browser?.close());

describe("fieldKey", () => {
  it("keys a field by its question, without the required mark", () => {
    expect(fieldKey("How many years of work experience do you have with TypeScript?*")).toBe("q:how many years of work experience do you have with typescript?");
  });
});

describe.skipIf(!browser)("linkedinDriver", () => {
  it("goes through the pages, uploads the resume, answers the questions and stops at Review", async () => {
    const driver = linkedinDriver(page, INSTANT);
    expect(await driver.open(FIXTURE)).toBe("ok");
    // Contact info is filled already (LinkedIn keeps it): nothing open.
    expect(await driver.openFields!([])).toEqual([]);
    expect(await driver.nextPage!(resume)).toBe("next");
    // The resume page: the tailored resume is uploaded before moving on.
    expect(await driver.nextPage!(resume)).toBe("next");

    const open = await driver.openFields!([]);
    expect(open.map((f) => [f.key, f.kind, f.options])).toEqual([
      ["q:are you legally authorized to work in the united states?", "select", ["Yes", "No"]],
      ["q:how many years of work experience do you have with typescript?", "text", []],
      // Choices grouped only by their name, each labelled itself (newer forms): one question, its text from the box.
      ["q:which best describes your backend experience?", "select", ["Proven experience designing, developing, and maintaining backend software in production environments;", "Some experience"]],
    ]);
    // Without answers it won't move on.
    expect(await driver.nextPage!(resume)).toBe("stuck");
    expect(await driver.fill({ kind: "select", fieldName: open[0].key, label: open[0].label, required: true, value: ["Yes"] }, resume)).toBe(true);
    expect(await driver.fill({ kind: "text", fieldName: open[1].key, label: open[1].label, required: true, value: "8" }, resume)).toBe(true);
    expect(await driver.fill({ kind: "select", fieldName: open[2].key, label: open[2].label, required: true, value: ["Some experience"] }, resume)).toBe(true);
    expect(await driver.values([{ kind: "select", fieldName: open[2].key, label: "", required: true, value: [] }])).toEqual({ [open[2].key]: "Some experience" });
    // A field that isn't on the page: couldn't fill, not an error.
    expect(await driver.fill({ kind: "select", fieldName: "q:no such question", label: "", required: true, value: ["Yes"] }, resume)).toBe(false);
    expect(await driver.values([{ kind: "select", fieldName: open[0].key, label: "", required: true, value: ["Yes"] }])).toEqual({ [open[0].key]: "Yes" });
    expect(await driver.nextPage!(resume)).toBe("review");

    expect(await driver.confirmation()).toBeNull();
    await driver.submit();
    expect(await driver.confirmation()).toMatch(/your application was sent to acme/i);
    expect(await driver.challenge()).toBe(false);
  }, 30_000);

  it("reads every question with what it shows, and discards the form unsent", async () => {
    const driver = linkedinDriver(page, INSTANT);
    expect(await driver.open(FIXTURE)).toBe("ok");
    expect(await driver.pageQuestions!()).toEqual([
      { key: "q:email address", label: "Email address", kind: "select", options: ["ada@example.test"], value: ["ada@example.test"], required: true },
      { key: "q:mobile phone number", label: "Mobile phone number", kind: "text", options: [], value: ["7045550100"], required: true },
    ]);
    await driver.nextPage!(resume);
    await driver.nextPage!(resume);
    const shown = await driver.pageQuestions!();
    expect(shown.map((q) => [q.key, q.value])).toEqual([
      ["q:are you legally authorized to work in the united states?", []],
      ["q:how many years of work experience do you have with typescript?", []],
      ["q:how many years of work experience do you have with python?", ["3"]],
      ["q:which best describes your backend experience?", []],
    ]);
    expect(await driver.discard!()).toBe(true);
    expect(await page.locator('[data-testid="dialog-content"]').count()).toBe(0);
    expect(await driver.confirmation()).toBeNull();
  }, 30_000);

  it("finds no form on a page without Easy Apply", async () => {
    await page.setContent("<main><p>No longer accepting applications</p></main>");
    const driver = linkedinDriver(page, INSTANT);
    // A data URL stands in for a closed posting.
    expect(await driver.open("data:text/html,<main><p>No longer accepting applications</p></main>")).toBe("no_form");
  }, 30_000);
});
