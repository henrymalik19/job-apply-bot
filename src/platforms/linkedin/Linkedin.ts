// import { chromium } from "playwright";
import { chromium } from "playwright-extra";
import pluginStealth from "puppeteer-extra-plugin-stealth";

// ES Modules import
import { APP_ENV, HEADLESS_BROWSER } from "../../constants";
import {
  doesFileExist,
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
  onsiteRemoteFilters?: OnsiteRemoteFilterType[];
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
    onsiteRemoteFilters,
  }: HandleSearchForJobsProps) {
    if (!email || !password)
      throw new Error("Missing Linkedin Credentials (email and/or password)");

    const browser = await chromium.launch({
      headless: HEADLESS_BROWSER,
    });

    try {
      const storageStatePath = `${process.cwd()}/tmp/storage-states/linkedin/${userId}-storage-state.json`;
      const storageStateContents = await getStorageStateContents(
        "linkedin",
        userId,
      );

      const storageStateExists =
        (await doesFileExist(storageStatePath)) || !!storageStateContents;
      const context = await browser.newContext({
        ...(storageStateExists && {
          storageState:
            APP_ENV === "local"
              ? storageStatePath
              : JSON.parse(storageStateContents as string),
        }),
      });
      const page = await context.newPage();

      const linkedinHomePage = new LinkedinHomePage(page);
      const linkedinJobsPage = new LinkedinJobsPage(page);

      await linkedinHomePage.goto();
      await linkedinHomePage.login(email, password);

      await context.storageState({ path: storageStatePath });
      if (APP_ENV !== "local") {
        await uploadFile(storageStatePath);
      }

      await linkedinJobsPage.goto();
      const jobsDetails = await linkedinJobsPage.searchForJobs({
        job: jobTitle,
        city,
        state,
        country,
        datePostedFilter,
        onsiteRemoteFilters,
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
      const storageStatePath = `${process.cwd()}/tmp/storage-states/linkedin/${userId}-storage-state.json`;
      const storageStateContents = await getStorageStateContents(
        "linkedin",
        userId,
      );

      const storageStateExists =
        (await doesFileExist(storageStatePath)) || !!storageStateContents;
      const context = await browser.newContext({
        ...(storageStateExists && {
          storageState:
            APP_ENV === "local"
              ? storageStatePath
              : JSON.parse(storageStateContents as string),
        }),
      });

      const page = await context.newPage();
      const linkedinHomePage = new LinkedinHomePage(page);
      const linkedinJobDetailsPage = new LinkedinJobDetailsPage(page);

      await linkedinHomePage.goto();
      await linkedinHomePage.login(email, password);

      await context.storageState({ path: storageStatePath });
      if (APP_ENV !== "local") {
        await uploadFile(storageStatePath);
      }

      await linkedinJobDetailsPage.applyToJob(jobUrl);
    } finally {
      await browser.close();
    }
  }
}
export { Linkedin };
