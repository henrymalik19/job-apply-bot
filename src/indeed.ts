import { Browser } from "playwright";

async function handleIndeedApply(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://indeed.com");
}

export { handleIndeedApply };
