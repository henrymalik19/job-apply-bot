import { Browser, BrowserContext, Locator, Page } from "playwright";
import { NewJob, jobs as jobsTable } from "../database/schema/jobs";
import { db } from "../database/db";

import { userAgentStrings } from "../constants";

interface InitProps {
  email: string;
  password: string;
  browser: Browser;
}

interface SearchForJobsProps {
  job: string;
  location: string;
}

interface FindEasyApplyJobsFromSearchProps {
  easyApplyOnly: boolean;
}

class Linkedin {
  static URL = "https://linkedin.com";

  email!: string;
  password!: string;
  context!: BrowserContext;
  page!: Page;

  async init({ email, password, browser }: InitProps) {
    this.email = email;
    this.password = password;

    this.context = await browser.newContext({
      userAgent:
        userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
    });
    await this.context.addInitScript(
      "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    );

    this.page = await this.context.newPage();

    await this.page.goto(Linkedin.URL);

    await this.page.waitForTimeout(1000);
  }

  async login() {
    console.info("[info] logging into user account...");
    await this.page.getByLabel("Email or phone").fill(this.email);
    await this.page.getByLabel("Password", { exact: true }).fill(this.password);
    await this.page.getByRole("button", { name: "Sign in" }).click();

    // check to make sure logged in and return a 'isLoggedIn flag
    console.info("[info] login complete!");
    await this.page.waitForTimeout(10000); // FOR TESTING
  }

  async navigateToJobsPage() {
    console.info("[info] navigating to jobs page...");
    const jobsNavBtn = this.page.getByTitle("Jobs");
    await jobsNavBtn.waitFor();
    await jobsNavBtn.click();
    console.info("[info] navigation complete!");
  }

  async searchForJobs({ job, location }: SearchForJobsProps) {
    console.info("[info] beginning search for jobs...");
    await this.page
      .getByRole("combobox", { name: "Search by title, skill, or company" })
      .fill(job);
    const locationInput = this.page
      .getByLabel("City, state, or zip code")
      .first();
    await locationInput.waitFor();
    await locationInput.fill(location);

    await this.page.waitForTimeout(2000);
    await this.page.keyboard.press("Enter");
    console.info("[info] search for jobs complete!");
  }

  async findEasyApplyJobsFromSearch({
    easyApplyOnly,
  }: FindEasyApplyJobsFromSearchProps) {
    console.info("[info] finding 'Easy Apply' jobs from search...");
    const jobSearchResultsList = this.page.locator(".jobs-search-results-list");
    await jobSearchResultsList.waitFor();

    await this.page.waitForTimeout(2000);
    await jobSearchResultsList.evaluate(async (list) => {
      console.log(list);
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < list.scrollHeight; i += 100) {
        list.scrollTo(0, i);
        await delay(100);
      }
    });

    await this.page.waitForTimeout(2000);

    const jobs = await jobSearchResultsList
      .locator(".jobs-search-results__list-item")
      .all();

    if (easyApplyOnly) {
      const easyApplyJobs: Locator[] = [];

      for (const job of jobs) {
        if (
          await job.locator(".job-card-container__apply-method").isVisible()
        ) {
          const btnTextContent = await job
            .locator(".job-card-container__apply-method")
            .textContent();
          if (btnTextContent?.trim() === "Easy Apply") easyApplyJobs.push(job);
        }
      }

      console.info(`[info] ${easyApplyJobs.length} 'Easy Apply' jobs Found!`);
      return easyApplyJobs;
    }

    console.log(`[info] ${jobs.length} jobs Found`);
    return jobs;
  }

  async applyToEasyApplyJob(job: Locator) {
    console.info("[info] applying to easy apply job...");

    let jobDetails: Omit<NewJob, "createdAt" | "updatedAt"> | null = null;
    await job.click();

    await this.page.waitForTimeout(2000);

    const url = await this.page.url();
    const company = await this.page
      .locator(
        ".job-details-jobs-unified-top-card__primary-description-without-tagline > a"
      )
      .textContent();
    const jobTitle = await this.page
      .locator(".job-details-jobs-unified-top-card__job-title-link")
      .textContent();
    const jobDescHtml = await this.page.locator("#job-details").innerHTML();
    const jobDescText = await this.page.locator("#job-details").textContent();

    const easyApplyBtn = await this.page.locator(
      ".job-details-jobs-unified-top-card__container--two-pane .jobs-apply-button"
    );
    await easyApplyBtn.click();

    const applyModal = this.page.locator(".jobs-easy-apply-content");
    await applyModal.waitFor();

    while (await this.page.getByLabel("Continue to next step").isVisible()) {
      // Check if errors show up so we can break out and go to next job
      if (await this.hasErrors()) {
        console.info(
          "[info] errors found, cancelling apply to easy apply job..."
        );
        break;
      }
      // Contact info
      if (await this.isView("Contact info")) {
        console.debug("[debug] Contact info view");
        const labels = await this.getViewLabels(applyModal);
        console.debug("[debug]", labels);

        // await this.parseLabels(labels);
      }

      // Resume
      if (await this.isView("Resume", true)) {
        console.debug("[debug] Resume view");
        const labels = await this.getViewLabels(applyModal);
        console.debug("[debug]", labels);
      }

      // Additional Questions
      if (await this.isView("Additional Questions")) {
        console.debug("[debug] Additional Questions view");
        const labels = await this.getViewLabels(applyModal);
        console.debug("[debug]", labels);
      }

      // Work authorization
      if (await this.isView("Work authorization")) {
        console.log("[debug] Work authorization view");
        const labels = await this.getViewLabels(applyModal);
        console.debug("[debug]", labels);
      }

      await this.page.waitForTimeout(2000);
      const nextBtn = await this.page.getByLabel("Continue to next step");
      await nextBtn.click();
    }

    await this.page.waitForTimeout(2000);
    if (await this.page.getByLabel("Review your application").isVisible()) {
      await this.page.getByLabel("Review your application").click();
    }

    await this.page.waitForTimeout(2000);
    if (await this.page.getByLabel("Submit application").isVisible()) {
      await this.page.getByLabel("Submit application").click();

      console.debug("[info] submitting application...");

      jobDetails = {
        url,
        title: jobTitle?.trim() as string,
        description: jobDescText
          ?.trim()
          .split("\n")
          .map((i) => i.trim())
          .join("\n") as string,
        descriptionHtml: jobDescHtml?.trim() as string,
        company: company?.trim() as string,
      };

      console.info("[info] saving job details to database...");
      await db.insert(jobsTable).values(jobDetails);
      console.info("[info] saving job details complete!");
    }

    // close out of app to move on to next
    await this.page.waitForTimeout(2000);
    if (await this.page.getByRole("button", { name: "Dismiss" }).isVisible()) {
      await this.page.getByRole("button", { name: "Dismiss" }).click();
    }

    await this.page.waitForTimeout(2000);
    if (
      await this.page
        .locator('[data-control-name="discard_application_confirm_btn"]')
        .isVisible()
    ) {
      await this.page
        .locator('[data-control-name="discard_application_confirm_btn"]')
        .click();
    }

    return jobDetails;
  }

  private async isView(viewName: string, exact?: boolean) {
    return await this.page
      .getByRole("heading", { name: viewName, exact })
      .isVisible();
  }

  private async getViewLabels(view: Locator) {
    const inputContainers = await view
      .locator(".jobs-easy-apply-form-section__grouping")
      .all();

    const labels: { label: string; type: string }[] = [];

    for (const con of inputContainers) {
      let txtRaw: string | null;
      let elType: string = "";

      if (await con.locator("label span").first().isVisible()) {
        txtRaw = await con.locator("label span").first().textContent();

        if (txtRaw) {
          const el = await con.getByLabel(txtRaw.trim());
          elType = await el.evaluate((e) => e.nodeName.toLowerCase());
        }
      } else if (await con.locator("fieldset").isVisible()) {
        txtRaw = await con
          .locator("fieldset legend span")
          .first()
          .textContent();

        if (txtRaw) {
          const el = await con.getByLabel(txtRaw.trim());
          elType = "radio"; // await el.evaluate((e) => e.nodeName.toLowerCase());
        }
      } else {
        txtRaw = await con.locator("label").first().textContent();

        if (txtRaw) {
          const el = await con.getByLabel(txtRaw.trim());
          elType = await el.evaluate((e) => e.nodeName.toLowerCase());
        }
      }

      if (txtRaw) {
        const split = txtRaw.split("\n");
        const cleaned = split.map((i) => i.trim());
        const txt = cleaned.join("");

        labels.push({ label: txt, type: elType });
      }
    }

    return labels;
  }

  private async hasErrors() {
    const errors = await this.page
      .locator(".artdeco-inline-feedback--error")
      .all();

    return errors.length > 0;
  }

  async gotoSearchPage(page: number) {
    await this.page.getByLabel(`Page ${page}`, { exact: true }).click();
    await this.page.waitForTimeout(2000);
  }

  // private async parseLabels(el: { label: string; type: string }[]) {
  //   for (const label of labels) {
  //     const el = await this.page.getByLabel(el.label);

  //     console.log({ el });
  //   }
  // }
  private async isFieldset() {}
  private async isTextField() {}
  private async isSelect() {}
}

export { Linkedin };
