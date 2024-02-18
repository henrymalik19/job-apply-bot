import { access, constants } from "node:fs/promises";
import { Browser, BrowserContext, Page } from "playwright";

import { LinkedinHomePage } from "./pages/HomePage";
import { LinkedinJobsPage } from "./pages/JobsPage/JobsPage";
import { DatePostedFilterType, OnsiteRemoteFilterType } from "./types";

interface HandleLinkedinEasyApplyProps {
  browser: Browser;
  email: string;
  password: string;
  storageStatePath: string;
  job: string;
  location: string;
  datePostedFilter?: DatePostedFilterType;
  onsiteRemoteFilter?: OnsiteRemoteFilterType;
  jobCount: number;
}
async function handleLinkedinEasyApply({
  email,
  password,
  browser,
  storageStatePath,
  job,
  location,
  datePostedFilter,
  onsiteRemoteFilter,
  jobCount,
}: HandleLinkedinEasyApplyProps) {
  if (!email || !password)
    throw new Error("Missing Linkedin Credentials (email or password)");

  let storageStateExists: boolean;

  try {
    // check if storage state file exists
    await access(storageStatePath, constants.R_OK);
    storageStateExists = true;
  } catch {
    storageStateExists = false;
  }

  let context: BrowserContext;
  let page: Page;
  let linkedinHomePage: LinkedinHomePage;
  let linkedinJobsPage: LinkedinJobsPage;

  if (storageStateExists) {
    context = await browser.newContext({
      storageState: storageStatePath,
    });
  } else {
    context = await browser.newContext();
  }

  page = await context.newPage();
  linkedinHomePage = new LinkedinHomePage(page);
  linkedinJobsPage = new LinkedinJobsPage(page);

  await linkedinHomePage.goto();
  const success = await linkedinHomePage.login(email, password);
  if (!success) {
    console.error("[error] unable to continue");
  }

  await context.storageState({ path: storageStatePath });

  await linkedinJobsPage.goto();
  await linkedinJobsPage.searchAndApplyToEasyApplyJobs({
    job,
    location,
    datePostedFilter,
    onsiteRemoteFilter,
    jobCount,
  });

  console.info("[info] process complete");
}

export { handleLinkedinEasyApply };
