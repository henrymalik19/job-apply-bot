// A local record of one apply run, so a failed fill can be debugged without
// watching the window: every fill and its result, error text the form shows,
// the page's own script errors and failed requests, and screenshots. Written to
// data/apply-debug/<time>-<application id>/ (gitignored); the newest runs are kept.
import { appendFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import type { FormDriver } from "@/server/modules/apply/apply.service";

const KEEP_RUNS = 20;

// Visible error text on the form: alerts, error helper text, toasts.
const ERROR_SELECTOR = '[role="alert"], [class*="error" i], [class*="helper-text--error" i], [class*="toast" i]';

/** Starts a record for one application and returns a driver that writes to it. */
export async function recordRun(root: string, appId: string, page: Page, driver: FormDriver) {
  const dir = path.join(root, `${new Date().toISOString().replace(/[:.]/g, "-")}-${appId}`);
  await mkdir(dir, { recursive: true });
  await prune(root);
  const file = path.join(dir, "run.log");
  const write = (line: string) => appendFile(file, `${new Date().toISOString().slice(11, 23)} ${line}\n`).catch(() => undefined);
  let shots = 0;
  const shot = async (name: string) => {
    if (page.isClosed()) return;
    const to = path.join(dir, `${String(++shots).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: to, fullPage: true }).catch(() => undefined);
  };
  /** Error text showing on the page right now. */
  const shownErrors = async () =>
    page.isClosed()
      ? []
      : page.locator(ERROR_SELECTOR).evaluateAll((els) =>
          [...new Set(els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent ?? "").trim()).filter(Boolean))].slice(0, 10),
        ).catch(() => []);

  page.on("pageerror", (e) => void write(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") void write(`console.${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) void write(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => void write(`request failed: ${r.url().slice(0, 200)} (${r.failure()?.errorText ?? "?"})`));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) void write(`page: ${f.url()}`);
  });

  const recorded: FormDriver = {
    ...driver,
    async open(url) {
      await write(`open ${url}`);
      const result = await driver.open(url);
      await write(`open -> ${result}`);
      await shot("opened");
      return result;
    },
    async fill(step, resumePath) {
      const shown = step.kind === "resume" ? path.basename(resumePath) : JSON.stringify(step.value).slice(0, 120);
      let ok = false;
      try {
        ok = await driver.fill(step, resumePath);
      } catch (err) {
        await write(`fill ${step.fieldName} (${step.kind}) "${step.label}" = ${shown} -> threw: ${(err as Error).message.split("\n")[0]}`);
        throw err;
      }
      await write(`fill ${step.fieldName} (${step.kind}) "${step.label}" = ${shown} -> ${ok ? "ok" : "NOT FILLED"}`);
      if (step.kind === "resume") {
        // Uploads finish after the change event; give the page a moment before looking.
        await page.waitForTimeout(2000).catch(() => undefined);
        await shot("after-resume");
      }
      const errors = await shownErrors();
      if (errors.length) await write(`  form shows: ${errors.join(" | ")}`);
      return ok;
    },
    async screenshot() {
      await shot("evidence");
      return driver.screenshot();
    },
  };

  return {
    driver: recorded,
    log: (line: string) => void write(line),
    /** Final screenshot, the form's error text and HTML; call when the run ends. */
    async finish(outcome: string) {
      await write(`outcome: ${outcome}`);
      const errors = await shownErrors();
      if (errors.length) await write(`form shows at end: ${errors.join(" | ")}`);
      await shot("end");
      if (!page.isClosed()) {
        const html = await page.locator("#application-form").evaluate((f) => f.outerHTML).catch(() => null);
        if (html) await writeFile(path.join(dir, "form.html"), html).catch(() => undefined);
      }
      return dir;
    },
  };
}

/** Keeps the newest runs only. */
async function prune(root: string) {
  const runs = (await readdir(root).catch(() => [])).sort();
  for (const old of runs.slice(0, Math.max(0, runs.length - KEEP_RUNS))) {
    await rm(path.join(root, old), { recursive: true, force: true }).catch(() => undefined);
  }
}
