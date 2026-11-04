// Filling a form at a person's pace. Sites score how a form is filled (reCAPTCHA, hCaptcha):
// fields set in milliseconds with no keystrokes look automated and earn more checks (an emailed
// security code, a CAPTCHA). So each field is scrolled to, clicked and typed key by key with small
// random gaps, with a short pause between fields. Long answers are typed for a stretch, then entered
// in short bursts, so a long essay doesn't take minutes. Nothing here tries to defeat a check: it
// only avoids looking like a script.
import type { Locator, Page } from "playwright-core";

/** How fast to fill: per-key delay and pause between fields (ms, min and max), and how much of a long answer is typed key by key. */
export type Pace = { keyMs: [number, number]; fieldPauseMs: [number, number]; typedChars: number; burstChars: number };

/** A person's pace: about 30–90 ms a key and up to a second between fields. */
export const HUMAN: Pace = { keyMs: [30, 90], fieldPauseMs: [300, 1200], typedChars: 160, burstChars: 60 };

/** No delays, for tests against fixture pages. */
export const INSTANT: Pace = { keyMs: [0, 0], fieldPauseMs: [0, 0], typedChars: Number.POSITIVE_INFINITY, burstChars: 1 };

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

/** The pause before the next field, as someone reads it and moves to it. */
export async function pause(page: Page, pace: Pace): Promise<void> {
  const ms = between(pace.fieldPauseMs);
  if (ms > 0) await page.waitForTimeout(ms);
}

/** Types text key by key, each with its own small random delay. */
async function keys(page: Page, text: string, pace: Pace): Promise<void> {
  for (const ch of text) {
    await page.keyboard.type(ch);
    const ms = between(pace.keyMs);
    if (ms > 0) await page.waitForTimeout(ms);
  }
}

/**
 * Scrolls to a text box, clicks it, clears what's there and types `text` like a person: key by key,
 * then (past `typedChars`) in short bursts with a pause after each.
 */
export async function typeInto(input: Locator, text: string, pace: Pace): Promise<void> {
  const page = input.page();
  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await input.click();
  // Whatever is there (a site's own guess from the resume, say) goes first.
  await input.fill("");
  if (pace.keyMs[1] === 0) {
    await input.fill(text);
    return;
  }
  const typed = text.slice(0, pace.typedChars);
  await keys(page, typed, pace);
  for (let i = typed.length; i < text.length; i += pace.burstChars) {
    await page.keyboard.insertText(text.slice(i, i + pace.burstChars));
    await page.waitForTimeout(between(pace.keyMs) * 3);
  }
}

/** Types a search (a place, a school, an option's name) key by key so the site's suggestions follow along. */
export async function typeSearch(input: Locator, text: string, pace: Pace): Promise<void> {
  await input.scrollIntoViewIfNeeded().catch(() => undefined);
  await input.click();
  await input.fill("");
  // Searches run on keystrokes, so even at an instant pace the keys are pressed one by one.
  await input.pressSequentially(text, { delay: Math.max(20, Math.round(between(pace.keyMs))) });
}
