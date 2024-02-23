// import { chromium } from "playwright";
import { chromium } from "playwright-extra";
import pluginStealth from "puppeteer-extra-plugin-stealth";

// ES Modules import
import { HEADLESS_BROWSER } from "../../constants";
import {
  getStorageStateContents,
  getStorageStatePresignedUrl,
  uploadFile,
} from "../../utils";
import { LinkedinHomePage } from "./pages/HomePage";
import { LinkedinJobDetailsPage } from "./pages/JobDetailsPage";
import { LinkedinJobsPage } from "./pages/JobsPage";
import { DatePostedFilterType, OnsiteRemoteFilterType } from "./types";

chromium.use(pluginStealth());

interface HandleSearchForJobsProps {
  userId: number;
  email: string;
  password: string;
  jobTitle: string;
  city: string | null;
  state: string | null;
  country: string;
  datePostedFilter?: DatePostedFilterType;
  onsiteRemoteFilter?: OnsiteRemoteFilterType;
  easyApplyFilter?: boolean;
}

interface HandleApplyForJobsProps {
  userId: number;
  jobUrl: string;
  email: string;
  password: string;
}

class Linkedin {
  static async handleSearchForJobs({
    userId,
    email,
    password,
    jobTitle,
    city,
    state,
    country,
    datePostedFilter,
    onsiteRemoteFilter,
  }: HandleSearchForJobsProps) {
    if (!email || !password)
      throw new Error("Missing Linkedin Credentials (email and/or password)");

    const browser = await chromium.launch({
      headless: HEADLESS_BROWSER,
    });

    try {
      const storageStateContents = await getStorageStateContents(
        "linkedin",
        userId,
      );

      const context = await browser.newContext({
        ...(storageStateContents && {
          storageState: JSON.parse(storageStateContents),
        }),
      });
      const page = await context.newPage();

      const linkedinHomePage = new LinkedinHomePage(page);
      const linkedinJobsPage = new LinkedinJobsPage(page);

      await linkedinHomePage.goto();
      await linkedinHomePage.login(email, password);

      const storageStatePath = `./tmp/storage-states/linkedin/${userId}-storage-state.json`;
      await context.storageState({ path: storageStatePath });
      await uploadFile(storageStatePath);

      await linkedinJobsPage.goto();
      const jobsDetails = await linkedinJobsPage.searchForJobs({
        job: jobTitle,
        city,
        state,
        country,
        datePostedFilter,
        onsiteRemoteFilter,
      });

      return jobsDetails;
    } finally {
      await browser.close();
    }
  }

  static async handleApplyForJobs({
    userId,
    jobUrl,
    email,
    password,
  }: HandleApplyForJobsProps) {
    if (!email || !password)
      throw new Error("Missing Linkedin Credentials (email and/or password)");

    const browser = await chromium.launch({
      headless: HEADLESS_BROWSER,
    });

    try {
      const storageStateContents = await getStorageStateContents(
        "linkedin",
        userId,
      );

      console.log(!!storageStateContents, storageStateContents);
      const context = await browser.newContext({
        ...(storageStateContents && {
          storageState: JSON.parse(storageStateContents),
        }),
      });
      const page = await context.newPage();
      const linkedinHomePage = new LinkedinHomePage(page);
      const linkedinJobDetailsPage = new LinkedinJobDetailsPage(page);

      await linkedinHomePage.goto();
      await linkedinHomePage.login(email, password);

      const storageStatePath = `./tmp/storage-states/linkedin/${userId}-storage-state.json`;
      await context.storageState({ path: storageStatePath });
      await uploadFile(storageStatePath);

      await linkedinJobDetailsPage.applyToJob(jobUrl);
    } finally {
      await browser.close();
    }
  }
}
export { Linkedin };
