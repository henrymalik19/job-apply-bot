// Fills Greenhouse's hosted application form (job-boards.greenhouse.io) in a
// real Chrome tab. Each question's field name from the form API is the
// element id (demographic questions drop the "demographic_" prefix the API
// gives them); selects are react-select comboboxes picked by option label; the
// resume is a file input. Never touches CAPTCHAs: it only reports them.
import type { Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";
import { DECLINE } from "@/server/integrations/ats/forms";
import { sameText, type FillStep } from "@/server/modules/apply/fill-plan";
import { HUMAN, pause, typeInto, typeSearch, type Pace } from "./human";
import { scanOpenFields } from "./open-fields";

/** The element id of a form field: demographic questions use their bare number. */
const domId = (fieldName: string) => fieldName.replace(/^demographic_(?=\d+$)/, "");
const byId = (fieldName: string) => `[id=${JSON.stringify(domId(fieldName))}]`;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
/** Greenhouse's check after submit: "enter the 8-character code sent to your email". */
const EMAIL_CODE = /code (was |that was |we )?(sent|emailed) to|security code|verification code/i;
const CONFIRMED = /thank you for (applying|your (application|interest))|application (has been |was )?(received|submitted)/i;

/**
 * A FormDriver for one Greenhouse tab.
 *
 * @param formTimeoutMs - How long to wait for the form before calling the page formless.
 * @param pace - How fast to type and move between fields (a person's pace unless a test says otherwise).
 */
export function greenhouseDriver(page: Page, formTimeoutMs = 15_000, pace: Pace = HUMAN): FormDriver {
  const form = page.locator("#application-form");

  /**
   * Ticks one box of a checkbox group (a multi-select shown as a fieldset of checkboxes,
   * like Upstart's "Location Preference") by its label; false when no box has it.
   */
  async function tick(fieldName: string, label: string): Promise<boolean> {
    const boxes = form.locator(`input[type=checkbox][name=${JSON.stringify(fieldName)}]`);
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      const box = boxes.nth(i);
      const id = await box.getAttribute("id");
      const text = id ? await form.locator(`label[for=${JSON.stringify(id)}]`).textContent().catch(() => null) : null;
      if (text != null && norm(text) === norm(label)) {
        await box.check();
        return box.isChecked();
      }
    }
    return false;
  }

  /** Picks one option of a combobox by its label (or ticks it in a checkbox group); false when no option matches. */
  async function pick(fieldName: string, label: string): Promise<boolean> {
    if ((await form.locator(`fieldset[id=${JSON.stringify(fieldName)}] input[type=checkbox]`).count()) > 0) return tick(fieldName, label);
    const input = page.locator(byId(fieldName));
    await typeSearch(input, label, pace);
    const options = page.locator(`[id=${JSON.stringify(`react-select-${domId(fieldName)}-listbox`)}] [role=option]`);
    await options.first().waitFor({ timeout: 3000 }).catch(() => undefined);
    const texts = await options.allTextContents();
    let i = texts.findIndex((t) => norm(t) === norm(label));
    if (i < 0 && texts.length === 1 && norm(texts[0]).startsWith(norm(label))) i = 0;
    if (i < 0) {
      await input.press("Escape");
      return false;
    }
    await options.nth(i).click();
    return true;
  }

  /**
   * Types into a search combobox and picks the closest suggestion by shared words
   * ("Georgia State University" for "Georgia State Univ."). The whole value is
   * typed first, then shorter starts of it, since the search can miss on the full
   * name. Nothing close enough means nothing is picked.
   */
  async function pickClosest(fieldName: string, value: string): Promise<boolean> {
    const input = form.locator(byId(fieldName));
    const options = page.locator(`[id=${JSON.stringify(`react-select-${domId(fieldName)}-listbox`)}] [role=option]`);
    const words = norm(value).split(/[^a-z0-9]+/).filter(Boolean);
    const queries = [...new Set([value, words.slice(0, 3).join(" "), words.slice(0, 2).join(" "), words.find((w) => w.length > 3) ?? ""])].filter(Boolean);
    const score = (option: string) => {
      const have = new Set(norm(option).split(/[^a-z0-9]+/).filter(Boolean));
      const shared = words.filter((w) => have.has(w)).length;
      return shared / Math.max(words.length, have.size);
    };
    for (const query of queries) {
      await typeSearch(input, query, pace);
      await options.first().waitFor({ timeout: 3000 }).catch(() => undefined);
      const texts = await options.allTextContents();
      const best = texts.map((t, i) => ({ i, s: score(t) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.5) {
        await options.nth(best.i).click();
        return true;
      }
    }
    await input.fill("");
    await input.press("Escape");
    return false;
  }

  /** Opens a combobox and picks its decline option ("I don't wish to answer", "Decline To Self Identify"). */
  async function pickDecline(fieldName: string): Promise<boolean> {
    const input = form.locator(byId(fieldName));
    await input.click();
    const options = page.locator(`[id=${JSON.stringify(`react-select-${domId(fieldName)}-listbox`)}] [role=option]`);
    await options.first().waitFor({ timeout: 3000 }).catch(() => undefined);
    const i = (await options.allTextContents()).findIndex((t) => DECLINE.test(t));
    if (i < 0) {
      await input.press("Escape");
      return false;
    }
    await options.nth(i).click();
    return true;
  }

  /**
   * Types a place into a search combobox and picks the first suggestion that
   * starts with it ("Atlanta, Georgia" picks "Atlanta, Georgia, United States").
   * Only the part before the first comma is typed; the search finds nothing for "Atlanta, GA".
   */
  async function pickPlace(fieldName: string, place: string): Promise<boolean> {
    const input = form.locator(byId(fieldName));
    await typeSearch(input, place.split(",")[0].trim(), pace);
    const options = page.locator(`[id=${JSON.stringify(`react-select-${domId(fieldName)}-listbox`)}] [role=option]`);
    await options.first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const i = (await options.allTextContents()).findIndex((t) => norm(t).startsWith(norm(place)));
    if (i < 0) {
      await input.press("Escape");
      return false;
    }
    await options.nth(i).click();
    return true;
  }

  /**
   * Attaches a file and waits for its name to show in the field. The page's
   * uploader can still be starting up after the form renders ("Cannot read
   * properties of undefined (reading 'uploadFile')"), so a failed attach is retried.
   */
  async function attach(fieldName: string, filePath: string): Promise<boolean> {
    const group = form.locator(`[aria-labelledby=${JSON.stringify(`upload-label-${fieldName}`)}]`);
    const name = filePath.split(/[\\/]/).pop() ?? "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const input = form.locator(byId(fieldName));
      if ((await input.count()) === 0) break;
      await input.setInputFiles(filePath);
      const attached = await group.getByText(name, { exact: false }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
      if (attached) return true;
      // Clear the failed attempt so setting the same file fires a change again, then retry once the page settles.
      await input.setInputFiles([]).catch(() => undefined);
      await page.waitForTimeout(2000);
    }
    return false;
  }

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      if (!(await form.waitFor({ timeout: formTimeoutMs }).then(() => true, () => false))) return "no_form";
      // The form re-renders while its scripts finish loading; filling before that loses work.
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      return "ok";
    },

    async fill(step: FillStep, resumePath: string) {
      const el = form.locator(byId(step.fieldName));
      if ((await el.count()) === 0) return false;
      await pause(page, pace);
      if (step.kind === "resume") return attach(step.fieldName, resumePath);
      if (step.kind === "text") {
        await typeInto(el, step.value, pace);
        return sameText(await el.inputValue(), step.value);
      }
      if (step.kind === "location") return pickPlace(step.fieldName, step.value);
      if (step.kind === "decline") return pickDecline(step.fieldName);
      if (step.kind === "closest") return pickClosest(step.fieldName, step.value);
      if (step.kind === "check") {
        // The id is on a wrapper; the checkbox inside carries the field name.
        const box = form.locator(`input[type=checkbox][name=${JSON.stringify(step.fieldName)}]`).first();
        if ((await box.count()) === 0) return false;
        await box.check();
        return box.isChecked();
      }
      for (const label of step.value) if (!(await pick(step.fieldName, label))) return false;
      return true;
    },

    async has(fieldName) {
      // A field by its id or name, or a file upload's labelled group.
      const any = [byId(fieldName), `[name=${JSON.stringify(fieldName)}]`, `[aria-labelledby=${JSON.stringify(`upload-label-${fieldName}`)}]`].join(", ");
      return (await form.locator(any).count().catch(() => 0)) > 0;
    },

    async openFields(known) {
      const open = await scanOpenFields(page, "#application-form", "id", known.map(domId));
      // A react-select dropdown lists its options only while open: open it, read them, close it.
      for (const f of open.filter((f) => f.kind === "combobox")) {
        const input = page.locator(byId(f.key));
        await input.click().catch(() => undefined);
        const options = page.locator(`[id=${JSON.stringify(`react-select-${f.key}-listbox`)}] [role=option]`);
        await options.first().waitFor({ timeout: 2000 }).catch(() => undefined);
        f.options = (await options.allTextContents()).map((t) => t.trim()).filter(Boolean);
        await input.press("Escape").catch(() => undefined);
        if (f.options.length) f.kind = "select";
      }
      return open;
    },

    async values(steps) {
      const fields = steps.filter((s) => s.kind !== "resume" && s.kind !== "check" && s.kind !== "decline").map((s) => ({ name: s.fieldName, id: domId(s.fieldName), select: s.kind !== "text" }));
      return page.evaluate((list) => {
        const out: Record<string, string> = {};
        for (const f of list) {
          const el = document.getElementById(f.id) as HTMLInputElement | HTMLTextAreaElement | null;
          if (!el) continue;
          if (!f.select) {
            out[f.name] = el.value;
            continue;
          }
          const control = el.closest(".select__control") ?? el.closest("[class*=control]");
          const chosen = control?.querySelectorAll(".select__single-value, .select__multi-value__label");
          if (chosen) out[f.name] = [...chosen].map((c) => c.textContent?.trim() ?? "").join(", ");
        }
        return out;
      }, fields);
    },

    async challenge() {
      // The invisible reCAPTCHA badge is always there; only a shown challenge counts.
      const frames = page.locator('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"]');
      for (const frame of await frames.all()) {
        const box = await frame.boundingBox().catch(() => null);
        if (box && box.height > 100 && (await frame.isVisible())) return true;
      }
      return false;
    },

    async emailCode() {
      if (page.isClosed()) return false;
      if ((await page.locator('input[id^="security-input"]').count().catch(() => 0)) > 0) return true;
      return EMAIL_CODE.test(await form.innerText({ timeout: 1000 }).catch(() => ""));
    },

    async enterEmailCode(code) {
      // Greenhouse shows one box per character (security-input-0, -1, …); a single box takes it whole.
      const boxes = page.locator('input[id^="security-input"]');
      const n = await boxes.count();
      if (n === 0) return false;
      if (n === 1) await boxes.first().fill(code);
      else for (let i = 0; i < Math.min(n, code.length); i++) await boxes.nth(i).fill(code[i]);
      await form.locator('button[type="submit"]').click();
      return true;
    },

    async confirmation() {
      if (page.isClosed()) return null;
      const onForm = (await form.count().catch(() => 1)) > 0;
      if (onForm && !page.url().includes("/confirmation")) return null;
      const text = await page.locator("body").innerText().catch(() => "");
      return page.url().includes("/confirmation") || CONFIRMED.test(text) ? text.trim() : null;
    },

    async submit() {
      await form.locator('button[type="submit"]').click();
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
