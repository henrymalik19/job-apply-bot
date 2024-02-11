// import { chromium } from "playwright";
import { chromium } from "playwright-extra";
// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
import pluginStealth from "puppeteer-extra-plugin-stealth";

import { handleLinkedinEasyApply } from "./linkedin/handleLinkedinEasyApply";
import { handleIndeedApply } from "./indeed";

chromium.use(pluginStealth());

const LINKEDIN_CREDS = {
  email: process.env.LINKEDIN_EMAIL,
  password: process.env.LINKEDIN_PASSWORD,
};

async function main() {
  const browser = await chromium.launch({
    headless: false,
  });

  await Promise.all([
    handleLinkedinEasyApply({
      browser,
      storageStatePath: "./auth-test.json",
      email: process.env.LINKEDIN_EMAIL || "",
      password: process.env.LINKEDIN_PASSWORD || "",
      job: "Software Engineer",
      location: "Remote",
      jobCount: 10,
    }),
    // handleIndeedApply(browser),
  ]);
}

main().catch((e) => {
  console.error(e);
});
