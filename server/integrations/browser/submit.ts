// Clicking a form's Submit without mistaking a submission already under way for a failure: the button can
// be on its spinner (disabled) because the form is already submitting, or be gone because the page moved on
// to its thank-you page. Either way the confirmation check that follows decides; only a button that's still
// there, enabled, and won't take the click is an error.
import type { Locator } from "playwright-core";

/** Clicks Submit, unless the form is already submitting or has moved on. */
export async function clickSubmit(button: Locator): Promise<void> {
  const first = button.first();
  if ((await button.count().catch(() => 0)) === 0) return;
  if (await first.isDisabled().catch(() => false)) {
    // Already submitting: wait for the page to move on (or the spinner to stop) rather than click again.
    await first.waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
    return;
  }
  try {
    await first.click({ timeout: 15_000 });
  } catch (err) {
    const gone = (await button.count().catch(() => 0)) === 0;
    const busy = !gone && (await first.isDisabled().catch(() => true));
    if (gone || busy) return;
    throw err;
  }
}
