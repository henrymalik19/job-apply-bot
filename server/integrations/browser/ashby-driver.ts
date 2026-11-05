// Fills Ashby's hosted application form (jobs.ashbyhq.com/<org>/<job id>/application) in a
// real Chrome tab. Every question sits in a box marked with its field path from the form API
// (div[data-field-path="..."]), so each step finds its box and then acts on what's inside:
// a text box, Yes/No buttons, radio buttons or checkboxes with labels, a type-and-pick
// combobox (location), or a file input. Every action is checked afterwards (the value is
// there, the option is chosen, the file name shows); anything that didn't take reports
// false rather than being assumed. Never touches CAPTCHAs: it only reports them.
import type { Locator, Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";
import { DECLINE } from "@/server/integrations/ats/forms";
import { sameText, type FillStep } from "@/server/modules/apply/fill-plan";
import { HUMAN, pause, typeInto, typeSearch, type Pace } from "./human";
import { scanOpenFields } from "./open-fields";
import { countryName, resolvePlace } from "@/server/modules/criteria/places";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const CONFIRMED = /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(successfully )?(received|submitted)/i;

/**
 * A FormDriver for one Ashby tab.
 *
 * @param formTimeoutMs - How long to wait for the form before calling the page formless.
 * @param pace - How fast to type and move between fields (a person's pace unless a test says otherwise).
 */
export function ashbyDriver(page: Page, formTimeoutMs = 15_000, pace: Pace = HUMAN): FormDriver {
  const fields = page.locator("[data-field-path]");
  const box = (fieldName: string) => page.locator(`[data-field-path=${JSON.stringify(fieldName)}]`).first();

  /** The option controls in a box: radio buttons or checkboxes, each with its label. */
  async function choices(container: Locator): Promise<{ input: Locator; label: string }[]> {
    const inputs = container.locator("input[type=radio], input[type=checkbox]");
    const out: { input: Locator; label: string }[] = [];
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute("id");
      const text = id ? await container.locator(`label[for=${JSON.stringify(id)}]`).first().textContent().catch(() => null) : null;
      if (text != null) out.push({ input, label: text });
    }
    return out;
  }

  /** Ticks (or chooses) the option with this label among a box's radios or checkboxes. */
  async function choose(container: Locator, wanted: (label: string) => boolean): Promise<boolean> {
    const option = (await choices(container)).find((c) => wanted(c.label));
    if (!option) return false;
    // The input itself is visually hidden behind a styled box; checking it the way a click would.
    await option.input.check({ force: true });
    return option.input.isChecked();
  }

  /** Presses the Yes or No button of a yes/no question. */
  async function yesNo(container: Locator, label: string): Promise<boolean> {
    const which = norm(label) === "yes" ? "yes" : norm(label) === "no" ? "no" : null;
    if (!which) return false;
    const button = container.locator(`button[data-option=${JSON.stringify(which)}]`);
    if ((await button.count()) === 0) return false;
    await button.click();
    return (await button.getAttribute("aria-pressed")) === "true";
  }

  /**
   * Types into a type-and-pick box and picks the suggestion that starts with what was typed
   * (or, failing that, the only one). Only the part before the first comma is typed for a place.
   */
  async function pick(container: Locator, value: string): Promise<boolean> {
    if (await pickOne(container, value)) return true;
    // Some forms ask for the country here (their search finds only countries): "Atlanta, GA" is the United States.
    const countries = [...resolvePlace(value).countries];
    const country = countries.length === 1 ? countryName(countries[0]) : null;
    return !!country && norm(country) !== norm(value) && pickOne(container, country);
  }

  async function pickOne(container: Locator, value: string): Promise<boolean> {
    const input = container.locator("[role=combobox]").first();
    // The search runs on keystrokes; pasting the whole value at once finds nothing.
    await typeSearch(input, value.split(",")[0].trim(), pace);
    const options = page.locator("[role=listbox] [role=option]");
    await options.first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const texts = await options.allTextContents();
    let i = texts.findIndex((t) => norm(t).startsWith(norm(value)));
    if (i < 0) i = texts.findIndex((t) => norm(t).startsWith(norm(value.split(",")[0])));
    if (i < 0 && texts.length === 1) i = 0;
    if (i < 0) {
      await input.press("Escape");
      return false;
    }
    const picked = (await options.nth(i).textContent())?.trim() ?? "";
    await options.nth(i).click();
    // The box shows the pick a moment after the click: wait for it rather than reading too early.
    for (let waited = 0; waited < 2000; waited += 100) {
      if (norm(await input.inputValue().catch(() => "")) === norm(picked)) return true;
      await page.waitForTimeout(100);
    }
    return false;
  }

  /** Attaches a file and waits for its name to show in the box, retrying once the uploader is ready. */
  async function attach(container: Locator, filePath: string): Promise<boolean> {
    const name = filePath.split(/[\\/]/).pop() ?? "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const input = container.locator("input[type=file]").first();
      if ((await input.count()) === 0) return false;
      await input.setInputFiles(filePath);
      if (await container.getByText(name, { exact: false }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)) return true;
      await input.setInputFiles([]).catch(() => undefined);
      await page.waitForTimeout(2000);
    }
    return false;
  }

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      if (!(await fields.first().waitFor({ timeout: formTimeoutMs }).then(() => true, () => false))) return "no_form";
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      return "ok";
    },

    async fill(step: FillStep, resumePath: string) {
      const container = box(step.fieldName);
      if ((await container.count()) === 0) return false;
      await container.scrollIntoViewIfNeeded().catch(() => undefined);
      await pause(page, pace);
      if (step.kind === "resume") return attach(container, resumePath);
      if (step.kind === "decline") return choose(container, (label) => DECLINE.test(label));
      if (step.kind === "check") return choose(container, () => true);
      if (step.kind === "select") {
        if ((await container.locator("button[data-option]").count()) > 0) return step.value.length === 1 && yesNo(container, step.value[0]);
        if ((await container.locator("[role=combobox]").count()) > 0) return step.value.length === 1 && pick(container, step.value[0]);
        for (const label of step.value) if (!(await choose(container, (l) => norm(l) === norm(label)))) return false;
        return step.value.length > 0;
      }
      // Text, place and search answers: a type-and-pick box when there is one, else a text box.
      if ((await container.locator("[role=combobox]").count()) > 0) return pick(container, step.value);
      const input = container.locator("input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea").first();
      if ((await input.count()) === 0) return false;
      await typeInto(input, step.value, pace);
      return sameText(await input.inputValue(), step.value);
    },

    async has(fieldName) {
      return (await box(fieldName).count().catch(() => 0)) > 0;
    },

    async openFields(known) {
      return scanOpenFields(page, "body", "path", known);
    },

    async values(steps) {
      const out: Record<string, string> = {};
      for (const s of steps) {
        if (s.kind === "resume" || s.kind === "check" || s.kind === "decline") continue;
        const container = box(s.fieldName);
        if ((await container.count()) === 0) continue;
        const pressed = container.locator('button[data-option][aria-pressed="true"]');
        if ((await pressed.count()) > 0) {
          out[s.fieldName] = ((await pressed.first().textContent()) ?? "").trim();
          continue;
        }
        const picked = [];
        for (const c of await choices(container)) if (await c.input.isChecked()) picked.push(c.label.trim());
        if (picked.length) {
          out[s.fieldName] = picked.join(", ");
          continue;
        }
        const input = container.locator("input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea").first();
        if ((await input.count()) > 0) out[s.fieldName] = await input.inputValue();
      }
      return out;
    },

    async challenge() {
      // The invisible reCAPTCHA badge is always there; only a shown challenge counts.
      const frames = page.locator('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"]');
      for (const frame of await frames.all()) {
        const rect = await frame.boundingBox().catch(() => null);
        if (rect && rect.height > 100 && (await frame.isVisible())) return true;
      }
      return false;
    },

    // Ashby doesn't ask for an emailed code.
    async emailCode() {
      return false;
    },

    async enterEmailCode() {
      return false;
    },

    async confirmation() {
      if (page.isClosed()) return null;
      if ((await fields.count().catch(() => 1)) > 0) return null;
      const text = await page.locator("body").innerText().catch(() => "");
      return CONFIRMED.test(text) ? text.trim() : null;
    },

    async submit() {
      await page.getByRole("button", { name: /submit application/i }).click();
    },

    async screenshot() {
      return new Uint8Array(await page.screenshot({ fullPage: true }));
    },

    async focus() {
      await page.bringToFront();
    },

    closed: () => page.isClosed(),
  };
}
