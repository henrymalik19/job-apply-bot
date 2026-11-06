// Fills a LinkedIn Easy Apply form (linkedin.com/jobs/view/<id>/) in the runner's own Chrome, where you
// signed in to LinkedIn yourself. The form is a dialog of pages (contact info, resume, questions, review):
// each page's empty required fields are found and answered, your tailored resume is uploaded, and it moves
// on with Next until the Review page, where it stops for you to click "Submit application" (supervised).
// A form with questions it can't answer is gone through with stand-ins, so every page's questions are seen,
// then closed with Discard: nothing is sent, and the questions are asked in the app.
// LinkedIn's class names are generated, so everything is found by role, label and text. It never tries to
// get past a security check or CAPTCHA: it reports one, and the runner stops LinkedIn work until you've
// dealt with it.
import type { Locator, Page } from "playwright-core";
import type { FormDriver, PageQuestion } from "@/server/modules/apply/apply.service";
import { sameText, type FillStep } from "@/server/modules/apply/fill-plan";
import { HUMAN, pause, typeInto, type Pace } from "./human";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
/** A field's key: its question, so what's learned for one form carries over to the next one asking it. */
export const fieldKey = (label: string) => `q:${norm(label).replace(/[*✱]\s*$/, "").trim()}`;

/** The page after submitting ("Your application was sent to Acme"). */
const SENT = /your application was sent|application sent|application submitted/i;
/** LinkedIn's own checks: a security check page, a CAPTCHA, or "verify it's you". */
const CHECK = /security (check|verification)|verify (it'?s you|you'?re (a )?human)|captcha|unusual activity/i;
/** A posting you've already applied to, or one no longer taking applications. */
const CLOSED = /no longer accepting applications|applied \d+ \w+ ago|application submitted/i;

// Runs in the page: the dialog's visible questions, with what each shows now and whether it's required.
const SCAN = `(() => {
  const d = document.querySelector('[data-testid="dialog-content"]') || document.querySelector('[role="dialog"]');
  if (!d) return [];
  const clean = (t) => (t || "").replace(/\\s+/g, " ").replace(/[*✱]\\s*$/, "").trim();
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const labelOf = (e) => {
    if (e.type === "radio" || e.type === "checkbox") {
      const g = e.closest('[role="radiogroup"], fieldset');
      const by = g && g.getAttribute("aria-labelledby");
      const l = by ? document.getElementById(by) : g && (g.querySelector("legend") || g.previousElementSibling);
      return clean((l && l.textContent) || e.getAttribute("aria-label"));
    }
    const l = e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
    return clean((l && l.textContent) || e.getAttribute("aria-label") || e.getAttribute("placeholder"));
  };
  const optionOf = (e) => {
    const l = e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
    if (l && clean(l.textContent)) return clean(l.textContent);
    let c = e;
    for (let i = 0; i < 4 && c.parentElement; i++) { c = c.parentElement; if (clean(c.innerText)) return clean(c.innerText); }
    return e.value;
  };
  // Required: marked on the input, or a "*" after its question.
  const required = (e) => {
    if (e.required || e.getAttribute("aria-required") === "true") return true;
    const g = e.closest('[role="radiogroup"], fieldset');
    const by = g && g.getAttribute("aria-labelledby");
    const l = (e.type === "radio" || e.type === "checkbox")
      ? (by ? document.getElementById(by) : g && (g.querySelector("legend") || g.previousElementSibling))
      : e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
    return /[*✱]\\s*$/.test(((l && l.textContent) || "").trim());
  };
  const groups = new Map();
  for (const e of d.querySelectorAll("input, select, textarea")) {
    const type = (e.getAttribute("type") || "").toLowerCase();
    if (["hidden", "file", "submit", "button", "search"].includes(type)) continue;
    if (!shown(e) && !(e.type === "radio" || e.type === "checkbox")) continue;
    const label = labelOf(e);
    if (!label) continue;
    const g = groups.get(label) || { label, kind: "text", options: [], value: [], required: false };
    g.required = g.required || required(e);
    if (e.tagName === "SELECT") {
      g.kind = "select";
      g.options = [...e.options].filter((o) => o.value !== "" && !/^select an option$/i.test(o.textContent.trim())).map((o) => clean(o.textContent));
      const picked = e.options[e.selectedIndex];
      g.value = e.value && picked && !/^select an option$/i.test(picked.textContent.trim()) ? [clean(picked.textContent)] : [];
    } else if (type === "radio" || type === "checkbox") {
      g.kind = type === "radio" ? "select" : "multiselect";
      g.options.push(optionOf(e));
      if (e.checked) g.value.push(optionOf(e));
    } else {
      g.kind = e.tagName === "TEXTAREA" ? "textarea" : e.getAttribute("role") === "combobox" ? "combobox" : "text";
      g.value = e.value.trim() ? [e.value.trim()] : [];
    }
    groups.set(label, g);
  }
  return [...groups.values()].map((g) => ({
    label: g.label, kind: g.kind === "multiselect" && g.options.length === 1 ? "agreement" : g.kind, options: g.options,
    value: g.value, required: g.required,
  }));
})()`;

/** The search results and job pages LinkedIn shows; the job's own page is /jobs/view/<id>/. */
export const jobUrl = (id: string) => `https://www.linkedin.com/jobs/view/${encodeURIComponent(id)}/`;

/**
 * A FormDriver for one LinkedIn tab.
 *
 * @param pace - How fast to type and move between fields (a person's pace unless a test says otherwise).
 */
export function linkedinDriver(page: Page, pace: Pace = HUMAN): FormDriver {
  const dialog = page.locator('[data-testid="dialog-content"], [role="dialog"]').first();
  const button = (name: RegExp) => dialog.getByRole("button", { name });

  /** The visible field (or radio group) whose question is `label`. */
  async function field(key: string): Promise<{ kind: "radio" | "checkbox" | "select" | "text"; inputs: Locator } | null> {
    const label = key.replace(/^q:/, "");
    const radios = dialog.locator("input[type=radio], input[type=checkbox]");
    for (let i = 0; i < (await radios.count()); i++) {
      const input = radios.nth(i);
      const asks = await input.evaluate((e) => {
        const g = e.closest('[role="radiogroup"], fieldset');
        const by = g?.getAttribute("aria-labelledby");
        const l = by ? document.getElementById(by) : g?.querySelector("legend") ?? g?.previousElementSibling;
        return ((l?.textContent ?? "") || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").replace(/[*✱]\s*$/, "").trim();
      });
      if (norm(asks) !== label) continue;
      const name = await input.getAttribute("name");
      const type = (await input.getAttribute("type")) === "checkbox" ? "checkbox" : "radio";
      return { kind: type, inputs: name ? dialog.locator(`input[name=${JSON.stringify(name)}]`) : input };
    }
    const labels = dialog.locator("label");
    for (let i = 0; i < (await labels.count()); i++) {
      const l = labels.nth(i);
      if (norm(((await l.textContent()) ?? "").replace(/[*✱]\s*$/, "")) !== label) continue;
      const id = await l.getAttribute("for");
      if (!id) continue;
      const input = dialog.locator(`[id=${JSON.stringify(id)}]`);
      const tag = await input.evaluate((e) => e.tagName).catch(() => "");
      return { kind: tag === "SELECT" ? "select" : "text", inputs: input };
    }
    return null;
  }

  /** The label shown beside a radio or checkbox. */
  async function optionText(input: Locator): Promise<string> {
    return input.evaluate((e) => {
      const l = e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
      if (l?.textContent?.trim()) return l.textContent.trim();
      let c: HTMLElement | null = e as HTMLElement;
      for (let i = 0; i < 4 && c?.parentElement; i++) {
        c = c.parentElement;
        if (c.innerText.trim()) return c.innerText.trim();
      }
      return (e as HTMLInputElement).value;
    });
  }

  /** Uploads the tailored resume on a page that asks for one, and picks it. */
  async function attachResume(resumePath: string): Promise<boolean> {
    const input = dialog.locator("input[type=file]").first();
    if ((await input.count()) === 0) return false;
    const name = resumePath.split(/[\\/]/).pop() ?? "";
    await input.setInputFiles(resumePath);
    return dialog.getByText(name, { exact: false }).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
  }

  /** Every question on the page showing now, with what it shows. */
  async function questions(): Promise<PageQuestion[]> {
    const found = (await page.evaluate(SCAN)) as Omit<PageQuestion, "key">[];
    return found.map((f) => ({ ...f, key: fieldKey(f.label) }));
  }

  /** Errors the page shows under its fields after Next ("This field is required"). */
  async function pageErrors(): Promise<string[]> {
    const texts = await dialog.locator("[role=alert], .artdeco-inline-feedback--error").allTextContents().catch(() => []);
    return texts.map((t) => t.trim()).filter((t) => t && !/characters?$/i.test(t));
  }

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const apply = page.locator('[aria-label="Easy Apply to this job"]').first();
      if (!(await apply.waitFor({ timeout: 15_000 }).then(() => true, () => false))) return "no_form";
      if (CLOSED.test((await page.locator("main").first().innerText().catch(() => "")).slice(0, 3000))) return "no_form";
      await pause(page, pace);
      await apply.click();
      return (await dialog.waitFor({ timeout: 15_000 }).then(() => true, () => false)) ? "ok" : "no_form";
    },

    async openFields(known) {
      return (await questions())
        .filter((q) => q.required && q.value.length === 0 && !known.includes(q.key))
        .map(({ key, label, kind, options }) => ({ key, label, kind, options }));
    },

    pageQuestions: questions,

    async discard() {
      // Closing the dialog asks whether to save the application: Discard keeps nothing.
      const close = page.locator('[role="dialog"] button[aria-label="Dismiss"], [role="dialog"] button[aria-label*="close" i]').first();
      if ((await close.count()) > 0) await close.click().catch(() => undefined);
      const discard = page.getByRole("button", { name: /^discard$/i }).first();
      if (await discard.waitFor({ timeout: 5000 }).then(() => true, () => false)) await discard.click();
      return page.locator('[data-testid="dialog-content"]').first().waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false);
    },

    async fill(step: FillStep, resumePath: string) {
      if (step.kind === "resume") return attachResume(resumePath);
      if (step.kind === "decline") return false;
      const found = await field(step.fieldName);
      if (!found) return false;
      await found.inputs.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await pause(page, pace);
      if (found.kind === "radio" || found.kind === "checkbox") {
        const wanted = step.kind === "select" ? step.value : step.kind === "check" ? null : [step.value];
        for (let i = 0; i < (await found.inputs.count()); i++) {
          const input = found.inputs.nth(i);
          const text = await optionText(input);
          if (wanted && !wanted.some((w) => norm(w) === norm(text))) continue;
          await input.check({ force: true });
          if (found.kind === "radio") return input.isChecked();
        }
        return (await found.inputs.evaluateAll((all) => all.some((e) => (e as HTMLInputElement).checked)));
      }
      const value = step.kind === "select" ? step.value[0] : step.kind === "check" ? null : step.value;
      if (value == null) return false;
      if (found.kind === "select") {
        const picked = await found.inputs.selectOption({ label: value }).catch(() => []);
        return picked.length > 0;
      }
      await typeInto(found.inputs, value, pace);
      // A box that suggests as you type (city): the first suggestion, when one shows.
      const suggestion = page.locator("[role=listbox] [role=option]").first();
      if (await suggestion.waitFor({ timeout: 1500 }).then(() => true, () => false)) await suggestion.click();
      return sameText(await found.inputs.inputValue(), value) || (await found.inputs.inputValue()).trim().length > 0;
    },

    async nextPage(resumePath) {
      // A resume page: your tailored resume, uploaded and picked, rather than whichever LinkedIn has.
      if ((await dialog.locator("input[type=file]").count()) > 0 && /resume/i.test(await dialog.innerText())) await attachResume(resumePath);
      const review = button(/^review$/i);
      const next = button(/^(next|continue)$/i);
      const target = (await review.count()) > 0 ? review : next;
      if ((await target.count()) === 0) return (await button(/submit application/i).count()) > 0 ? "review" : "stuck";
      const before = await dialog.innerText().catch(() => "");
      await pause(page, pace);
      await target.first().click();
      await page.waitForTimeout(1500);
      if ((await pageErrors()).length > 0) return "stuck";
      if ((await button(/submit application/i).count()) > 0) return "review";
      return (await dialog.innerText().catch(() => "")) === before ? "stuck" : "next";
    },

    async has(fieldName) {
      return (await field(fieldName)) != null;
    },

    async values(steps) {
      const out: Record<string, string> = {};
      for (const s of steps) {
        if (s.kind === "resume" || s.kind === "decline") continue;
        const found = await field(s.fieldName).catch(() => null);
        if (!found) continue;
        if (found.kind === "radio" || found.kind === "checkbox") {
          const picked: string[] = [];
          for (let i = 0; i < (await found.inputs.count()); i++) {
            const input = found.inputs.nth(i);
            if (await input.isChecked()) picked.push(await optionText(input));
          }
          out[s.fieldName] = picked.join(", ");
        } else if (found.kind === "select") {
          out[s.fieldName] = (await found.inputs.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? "")) ?? "";
        } else {
          out[s.fieldName] = await found.inputs.inputValue();
        }
      }
      return out;
    },

    async challenge() {
      if (/\/checkpoint\/|captcha/i.test(page.url())) return true;
      if ((await page.locator("iframe[src*=captcha], iframe[title*=captcha i]").count()) > 0) return true;
      return CHECK.test((await page.locator("body").innerText().catch(() => "")).slice(0, 4000));
    },

    emailCode: async () => false,
    enterEmailCode: async () => false,

    async confirmation() {
      const text = await page.locator("body").innerText().catch(() => "");
      const m = SENT.exec(text);
      if (!m) return null;
      return text.slice(Math.max(0, m.index - 100), m.index + 200).trim();
    },

    async submit() {
      const send = button(/submit application/i);
      if ((await send.count()) === 0) return;
      await pause(page, pace);
      await send.first().click();
    },

    async screenshot() {
      return new Uint8Array(await page.screenshot({ fullPage: false }));
    },

    async focus() {
      await page.bringToFront();
    },

    closed: () => page.isClosed(),
  };
}
