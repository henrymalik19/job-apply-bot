// Fills Greenhouse's hosted application form (job-boards.greenhouse.io) in a
// real Chrome tab. Each question's field name from the form API is the
// element id; selects are react-select comboboxes picked by option label; the
// resume is a file input. Never touches CAPTCHAs: it only reports them.
import type { Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";
import type { FillStep } from "@/server/modules/apply/fill-plan";

const byId = (id: string) => `[id=${JSON.stringify(id)}]`;
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
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
    const options = page.locator(`${byId(`react-select-${fieldName}-listbox`)} [role=option]`);
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

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return (await form.waitFor({ timeout: formTimeoutMs }).then(() => true, () => false)) ? "ok" : "no_form";
    },

    async fill(step: FillStep, resumePath: string) {
      const el = form.locator(byId(step.fieldName));
      if ((await el.count()) === 0) return false;
      if (step.kind === "resume") {
        await el.setInputFiles(resumePath);
        return true;
      }
      if (step.kind === "text") {
        await el.fill(step.value);
        return (await el.inputValue()) === step.value;
      }
      for (const label of step.value) if (!(await pick(step.fieldName, label))) return false;
      return true;
    },

    async values(steps) {
      const fields = steps.filter((s) => s.kind !== "resume").map((s) => ({ name: s.fieldName, select: s.kind === "select" }));
      return page.evaluate((list) => {
        const out: Record<string, string> = {};
        for (const f of list) {
          const el = document.getElementById(f.name) as HTMLInputElement | HTMLTextAreaElement | null;
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
