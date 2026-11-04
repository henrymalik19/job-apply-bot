// Fills Lever's hosted application form (jobs.lever.co/<company>/<id>/apply) in a real Chrome tab.
// Lever's form is plain HTML: every field is found by its form name (name, email, location,
// cards[<id>][field0], eeo[gender], …), selects are real <select>s, and choices are radios or
// checkboxes whose value is the option's text. Lever reads an uploaded resume and fills name, email,
// phone, company and location from it a few seconds later, so the resume is attached first and the
// driver waits for that to finish before anything else is filled; every field is then filled and
// checked over whatever Lever guessed. Never touches CAPTCHAs: it only reports them.
import type { Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";
import { DECLINE } from "@/server/integrations/ats/forms";
import { sameText, type FillStep } from "@/server/modules/apply/fill-plan";
import { HUMAN, pause, typeInto, typeSearch, type Pace } from "./human";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const byName = (name: string) => `[name=${JSON.stringify(name)}]`;
const CONFIRMED = /application (has been |was )?(successfully )?(received|submitted)|thank(s| you) for (applying|your application)/i;

/**
 * A FormDriver for one Lever tab.
 *
 * @param formTimeoutMs - How long to wait for the form before calling the page formless.
 * @param analysisTimeoutMs - How long Lever may take to read an uploaded resume.
 * @param pace - How fast to type and move between fields (a person's pace unless a test says otherwise).
 */
export function leverDriver(page: Page, formTimeoutMs = 15_000, analysisTimeoutMs = 45_000, pace: Pace = HUMAN): FormDriver {
  const form = page.locator("#application-form, form:has([name=email])").first();

  /**
   * Attaches the resume and waits for Lever to finish reading it ("Analyzing resume…" turns into
   * "Success!" or a failure), so its autofill is done before any field is filled.
   */
  async function attach(filePath: string): Promise<boolean> {
    const input = form.locator(byName("resume"));
    if ((await input.count()) === 0) return false;
    await input.setInputFiles(filePath);
    // "Analyzing resume…" shows, then "Success!" (or a failure) as Lever writes its guesses into the fields.
    await page.locator(".resume-upload-working").filter({ visible: true }).first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const done = page.locator(".resume-upload-success, .resume-upload-failure").filter({ visible: true }).first();
    if (!(await done.waitFor({ timeout: analysisTimeoutMs }).then(() => true, () => false))) return false;
    // Let its autofill (and the location lookup it starts) settle, so nothing lands after our own answers.
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    // A failed read still attached the file (Lever just couldn't pre-fill from it); a missing file name means it didn't.
    const name = filePath.split(/[\\/]/).pop() ?? "";
    return (await form.getByText(name, { exact: false }).count()) > 0 || (await page.locator(".resume-upload-success").filter({ visible: true }).count()) > 0;
  }

  /** Picks a place, trying again if a suggestion list closed early (Lever re-renders the box now and then). */
  async function pickPlace(value: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) if (await pickPlaceOnce(value)) return true;
    return false;
  }

  /** Types a place and picks Lever's suggestion that starts with it ("Atlanta, GA" picks "Atlanta, GA, USA"). */
  async function pickPlaceOnce(value: string): Promise<boolean> {
    const input = form.locator(byName("location"));
    // The suggestions come from keystrokes, not a pasted value.
    await typeSearch(input, value.split(",")[0].trim(), pace);
    const options = page.locator(".dropdown-location").filter({ visible: true });
    await options.first().waitFor({ timeout: 6000 }).catch(() => undefined);
    const texts = await options.allTextContents();
    let i = texts.findIndex((t) => norm(t).startsWith(norm(value)));
    if (i < 0 && texts.length === 1) i = 0;
    if (i < 0) return false;
    const picked = texts[i].trim();
    await options.nth(i).click();
    // The pick is kept in a hidden field Lever submits; the visible box shows its name.
    for (let waited = 0; waited < 2000; waited += 100) {
      const chosen = await form.locator(byName("selectedLocation")).inputValue().catch(() => "");
      if (chosen && norm(await input.inputValue()) === norm(picked)) return true;
      await page.waitForTimeout(100);
    }
    return false;
  }

  /** Chooses options of a select, radio group or checkbox group by their text. */
  async function choose(fieldName: string, wanted: (label: string) => boolean, many: boolean): Promise<boolean> {
    const select = form.locator(`select${byName(fieldName)}`);
    if ((await select.count()) > 0) {
      const options = (await select.locator("option").allTextContents()).map((t) => t.trim()).filter((t) => t && wanted(t));
      if (options.length === 0) return false;
      await select.selectOption({ label: options[0] });
      return wanted(((await select.locator("option:checked").textContent()) ?? "").trim());
    }
    const inputs = form.locator(`input[type=radio]${byName(fieldName)}, input[type=checkbox]${byName(fieldName)}`);
    let ticked = 0;
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i);
      // A survey for another region stays hidden until its location is picked: not ours to answer.
      if (!(await input.isVisible()) && !(await input.locator("xpath=ancestor::label[1]").isVisible().catch(() => false))) continue;
      if (!wanted(((await input.getAttribute("value")) ?? "").trim())) continue;
      await input.check({ force: !(await input.isVisible()) });
      if (!(await input.isChecked())) return false;
      ticked++;
      if (!many) break;
    }
    return ticked > 0;
  }

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      if (!(await form.locator(byName("email")).waitFor({ timeout: formTimeoutMs }).then(() => true, () => false))) return "no_form";
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      return "ok";
    },

    async fill(step: FillStep, resumePath: string) {
      if (step.kind === "resume") return attach(resumePath);
      if ((await form.locator(byName(step.fieldName)).count()) === 0) return false;
      await form.locator(byName(step.fieldName)).first().scrollIntoViewIfNeeded().catch(() => undefined);
      await pause(page, pace);
      if (step.kind === "decline") return choose(step.fieldName, (l) => DECLINE.test(l), false);
      if (step.kind === "check") return choose(step.fieldName, () => true, false);
      if (step.kind === "select") {
        if (step.value.length === 0) return false;
        for (const label of step.value) if (!(await choose(step.fieldName, (l) => norm(l) === norm(label), false))) return false;
        return true;
      }
      if (step.fieldName === "location") return pickPlace(step.value);
      const input = form.locator(`input${byName(step.fieldName)}, textarea${byName(step.fieldName)}`).first();
      if ((await input.count()) === 0) return false;
      await typeInto(input, step.value, pace);
      return sameText(await input.inputValue(), step.value);
    },

    async has(fieldName) {
      // On the form and shown (a survey for another region is in the page but hidden).
      const named = form.locator(byName(fieldName));
      for (let i = 0; i < (await named.count().catch(() => 0)); i++) {
        const el = named.nth(i);
        if ((await el.isVisible()) || (await el.locator("xpath=ancestor::label[1]").isVisible().catch(() => false))) return true;
      }
      return false;
    },

    async values(steps) {
      const out: Record<string, string> = {};
      for (const s of steps) {
        if (s.kind === "resume" || s.kind === "check" || s.kind === "decline") continue;
        const named = form.locator(byName(s.fieldName));
        if ((await named.count()) === 0) continue;
        const select = form.locator(`select${byName(s.fieldName)}`);
        if ((await select.count()) > 0) {
          out[s.fieldName] = ((await select.locator("option:checked").textContent()) ?? "").trim();
          continue;
        }
        const checked = await form.locator(`input${byName(s.fieldName)}:checked`).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        if (checked.length) {
          out[s.fieldName] = checked.join(", ");
          continue;
        }
        const input = form.locator(`input${byName(s.fieldName)}, textarea${byName(s.fieldName)}`).first();
        if ((await input.count()) > 0) out[s.fieldName] = await input.inputValue();
      }
      return out;
    },

    async challenge() {
      // Lever's hCaptcha is invisible until it decides to challenge; only a shown challenge counts.
      const frames = page.locator('iframe[src*="hcaptcha"], iframe[src*="recaptcha"][src*="bframe"], iframe[src*="challenges.cloudflare"]');
      for (const frame of await frames.all()) {
        const rect = await frame.boundingBox().catch(() => null);
        if (rect && rect.height > 100 && (await frame.isVisible())) return true;
      }
      return false;
    },

    // Lever doesn't ask for an emailed code.
    async emailCode() {
      return false;
    },

    async enterEmailCode() {
      return false;
    },

    async confirmation() {
      if (page.isClosed()) return null;
      const thanks = /\/thanks\b/.test(page.url());
      if (!thanks && (await form.count().catch(() => 1)) > 0) return null;
      const text = await page.locator("body").innerText().catch(() => "");
      return thanks || CONFIRMED.test(text) ? text.trim() : null;
    },

    async submit() {
      await form.locator('button[type=submit], #btn-submit').first().click();
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
