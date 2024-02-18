// import { chromium } from "playwright";
import { chromium } from "playwright-extra";
import pluginStealth from "puppeteer-extra-plugin-stealth";
import { handleLinkedinEasyApply } from "../platforms/linkedin/handleLinkedinEasyApply";
import { db } from "../database/db";
import { jobSearchesTable } from "../database/schema/jobSearches";
import { JOB_SEARCH_STATUS } from "../constants";

chromium.use(pluginStealth());

class JobSearchWorker {
  static async start() {
    const browser = await chromium.launch({
      headless: false,
    });

    await db.insert(jobSearchesTable).values({
      startedAt: new Date(),
      status: JOB_SEARCH_STATUS.RUNNING,
    });

    await handleLinkedinEasyApply({
      browser,
      storageStatePath: "./auth.json",
      email: process.env.LINKEDIN_EMAIL || "",
      password: process.env.LINKEDIN_PASSWORD || "",
      job: "Software Engineer",
      location: "United States",
      datePostedFilter: "past24Hours",
      onsiteRemoteFilter: "remote",
      jobCount: 10,
    });
  }
}

export { JobSearchWorker };
