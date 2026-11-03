// Fills Greenhouse's hosted application form (job-boards.greenhouse.io) in a
// real Chrome tab. Each question's field name from the form API is the
// element id (demographic questions drop the "demographic_" prefix the API
// gives them); selects are react-select comboboxes picked by option label; the
// resume is a file input. Never touches CAPTCHAs: it only reports them.
import type { Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";
import { DECLINE } from "@/server/integrations/ats/forms";
import { sameText, type FillStep } from "@/server/modules/apply/fill-plan";

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
 */
export function greenhouseDriver(page: Page, formTimeoutMs = 15_000): FormDriver {
  const form = page.locator("#application-form");

  /** Picks one option of a combobox by its label; false when no option matches. */
  async function pick(fieldName: string, label: string): Promise<boolean> {
    const input = page.locator(byId(fieldName));
    await input.click();
    await input.fill(label);
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
    await input.click();
    await input.fill(place.split(",")[0].trim());
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
      if (step.kind === "resume") return attach(step.fieldName, resumePath);
      if (step.kind === "text") {
        await el.fill(step.value);
        return sameText(await el.inputValue(), step.value);
      }
      if (step.kind === "location") return pickPlace(step.fieldName, step.value);
      if (step.kind === "decline") return pickDecline(step.fieldName);
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
