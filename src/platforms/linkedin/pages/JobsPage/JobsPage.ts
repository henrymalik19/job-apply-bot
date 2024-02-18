import { Locator, Page } from "playwright";
import { scrollToBottom } from "../../../../utils";
import { NewJob, jobs } from "../../../../database/schema/jobs";
import { db } from "../../../../database/db";
import { EasyApplyModal } from "./components/EasyApplyModal";
import { DatePostedFilterType, OnsiteRemoteFilterType } from "../../types";

interface SearchForJobsProps {
  job: string;
  location: string;
  datePostedFilter?: DatePostedFilterType;
  onsiteRemoteFilter?: OnsiteRemoteFilterType;
}

interface SearchAndApplyForJobsProps extends SearchForJobsProps {
  jobCount?: number;
}

class LinkedinJobsPage {
  static readonly url = "https://linkedin.com/jobs";

  private page: Page;
  readonly jobInput: Locator;
  readonly locationInput: Locator;
  readonly jobSearchResultsList: Locator;
  readonly companyLink: Locator;
  readonly bottomPageNavbar: Locator;
  readonly jobTitleHeader: Locator;
  readonly jobDescriptionContainer: Locator;
  readonly easyApplyBtn: Locator;
  readonly dateFilterBtn: Locator;
  readonly onsiteRemoteFilterBtn: Locator;
  readonly easyApplyFilterBtn: Locator;

  readonly easyApplyModal: EasyApplyModal;

  constructor(page: Page) {
    this.page = page;
    this.easyApplyModal = new EasyApplyModal(page);

    this.jobInput = this.page.getByRole("combobox", {
      name: "Search by title, skill, or company",
    });

    this.locationInput = this.page
      .getByLabel("City, state, or zip code")
      .first();

    this.jobSearchResultsList = this.page.locator(".jobs-search-results-list");

    this.companyLink = this.page.locator(
      ".job-details-jobs-unified-top-card__primary-description-without-tagline > a"
    );

    this.bottomPageNavbar = this.page.locator(
      ".jobs-search-results-list__pagination"
    );

    this.jobTitleHeader = this.page.locator(
      ".job-details-jobs-unified-top-card__job-title-link"
    );

    this.jobDescriptionContainer = this.page.locator("#job-details");

    this.easyApplyBtn = this.page.locator(
      ".job-details-jobs-unified-top-card__container--two-pane .jobs-apply-button"
    );

    this.dateFilterBtn = this.page.getByRole("button", {
      name: "Date posted filter. Clicking this button displays all Date posted filter options.",
    });

    this.onsiteRemoteFilterBtn = this.page.getByRole("button", {
      name: "Remote filter. Clicking this button displays all Remote filter options.",
    });

    this.easyApplyFilterBtn = this.page.getByRole("radio", {
      name: "Easy Apply filter",
    });
  }

  async goto() {
    console.info(`[info] navigating to ${LinkedinJobsPage.url}`);

    await this.page.goto(LinkedinJobsPage.url);

    console.info(`[info] navigation complete!`);
  }

  async gotoSearchPage(page: number) {
    console.info(`\n[info] navigating to search results page ${page}`);

    const nxtPageBtn = await this.bottomPageNavbar.getByLabel(`Page ${page}`, {
      exact: true,
    });
    await nxtPageBtn.click();

    console.info(`[info] navigation complete!`);
  }

  async searchForJobs({
    job,
    location,
    datePostedFilter,
    onsiteRemoteFilter,
  }: SearchForJobsProps) {
    try {
      console.info("\n[info] beginning job search...");

      await this.jobInput.fill(job);
      await this.locationInput.waitFor();
      await this.locationInput.fill(location);

      await this.page.waitForTimeout(2000);
      await this.page.keyboard.press("Enter");

      if (datePostedFilter) await this.handleDatePostedFilter(datePostedFilter);
      if (onsiteRemoteFilter)
        await this.handleOnsiteRemoteFilter(onsiteRemoteFilter);
      await this.handleEasyApplyFilter();

      console.info("[info] job search complete");

      return true;
    } catch (error) {
      console.error("[error] unable to search for jobs");

      return false;
    }
  }

  async handleDatePostedFilter(datePostedFilter: DatePostedFilterType) {
    const datePostedFilterLabelMap = {
      past24Hours: "24 hours",
      pastWeek: "week",
      pastMonth: "month",
    };

    await this.page.waitForTimeout(2000);

    console.info(
      `[info] filtering to jobs posted in the past ${datePostedFilterLabelMap[datePostedFilter]}...`
    );
    await this.dateFilterBtn.click();

    const filterDropdown = await this.page.getByRole("group", {
      name: "Filter results by: Date posted",
    });

    let label: Locator | null = null;
    for (const labelEl of await filterDropdown
      .locator("label p span:first-of-type")
      .all()) {
      if (
        (await labelEl.textContent())
          ?.trim()
          .toLowerCase()
          .includes(datePostedFilterLabelMap[datePostedFilter])
      ) {
        label = await labelEl;
      }
    }

    if (label) {
      await label.click();

      await this.page.waitForTimeout(2500);
      await filterDropdown.getByRole("button").nth(1).click();
    }
  }

  async handleOnsiteRemoteFilter(onsiteRemoteFilter: OnsiteRemoteFilterType) {
    await this.page.waitForTimeout(2000);

    console.info(`[info] filtering to only ${onsiteRemoteFilter} jobs...`);
    await this.onsiteRemoteFilterBtn.click();

    const filterDropdown = await this.page.getByRole("group", {
      name: "Filter results by: Remote",
    });

    let label: Locator | null = null;
    for (const labelEl of await filterDropdown
      .locator("label p span:first-of-type")
      .all()) {
      if (
        (await labelEl.textContent())
          ?.trim()
          .toLowerCase()
          .includes(onsiteRemoteFilter)
      ) {
        label = await labelEl;
      }
    }

    if (label) {
      await label.click();

      await this.page.waitForTimeout(2500);
      await filterDropdown.getByRole("button").nth(1).click();
    }
  }

  async handleEasyApplyFilter() {
    await this.page.waitForTimeout(2000);

    console.info(`[info] filtering to only 'Easy Apply' jobs...`);
    await this.easyApplyFilterBtn.click();
  }

  async getSearchedJobs() {
    try {
      console.info(`[info] finding "Easy Apply" jobs from search...`);

      await this.jobSearchResultsList.waitFor();

      await this.page.waitForTimeout(2000);
      await this.jobSearchResultsList.evaluate(scrollToBottom);

      await this.page.waitForTimeout(2000);

      const jobContainers = await this.jobSearchResultsList
        .locator(".jobs-search-results__list-item")
        .all();

      const easyApplyJobContainers: Locator[] = [];

      for (const jobContainer of jobContainers) {
        const applyMethod = jobContainer.locator(
          ".job-card-container__apply-method"
        );
        if (await applyMethod.isVisible()) {
          const applyMethodTxt = (await applyMethod.textContent())?.trim();
          if (applyMethodTxt === "Easy Apply")
            easyApplyJobContainers.push(jobContainer);
        }
      }

      console.info(
        `[info] ${easyApplyJobContainers.length} 'Easy Apply' jobs Found!`
      );
      return easyApplyJobContainers;
    } catch (error) {
      console.error("[error] unable to get searched jobs", error);
    }
  }

  async applyToJob(jobContainer: Locator) {
    try {
      console.info("\n" + "[info] applying to easy apply job...");

      await jobContainer.click();

      await this.page.waitForTimeout(2000);

      if (await this.easyApplyBtn.isVisible()) {
        console.info("[info] 'Easy Apply' button found");
        await this.easyApplyBtn.click();
        console.info("[info] opening 'Easy Apply' modal...");

        const wasSuccessful = await this.easyApplyModal.apply();

        return wasSuccessful;
      } else {
        console.info("[info] currently can only apply to 'Easy Apply' jobs");

        return false;
      }
    } catch (error) {
      console.error("[error] unable to apply for job", error);

      return false;
    }
  }

  async searchAndApplyToEasyApplyJobs({
    job,
    location,
    datePostedFilter,
    onsiteRemoteFilter,
    jobCount = 20,
  }: SearchAndApplyForJobsProps) {
    let appliedJobsCount = 0;
    let currentPage = 1;

    const success = await this.searchForJobs({
      job,
      location,
      datePostedFilter,
      onsiteRemoteFilter,
    });
    if (!success) return;

    loop1: while (appliedJobsCount < jobCount) {
      const jobContainers = await this.getSearchedJobs();
      if (!jobContainers) return;

      for (const jobContainer of jobContainers) {
        if (appliedJobsCount >= jobCount) {
          break loop1;
        }
        const wasSuccessful = await this.applyToJob(jobContainer);

        if (wasSuccessful) {
          appliedJobsCount++;
        }

        await this.saveJobDetailsToDB(wasSuccessful);
      }

      currentPage++;
      await this.gotoSearchPage(currentPage);
    }

    console.info(`[info] applied to ${appliedJobsCount} jobs`);
  }

  async saveJobDetailsToDB(wasSuccessful: boolean) {
    try {
      const url = await this.page.url();
      const jobId = new URL(url).searchParams.get("currentJobId") || "";

      const company = (await this.companyLink.textContent())?.trim();
      const jobTitle = (await this.jobTitleHeader.textContent())?.trim();
      const jobDescHtml = (
        await this.jobDescriptionContainer.innerHTML()
      ).trim();
      const jobDescText = (await this.jobDescriptionContainer.textContent())
        ?.trim()
        .split("\n")
        .map((i) => i.trim())
        .join("\n");
      if (url && company && jobTitle && jobDescHtml && jobDescText) {
        const jobDetails: Omit<NewJob, "createdAt" | "updatedAt"> = {
          url,
          jobBoard: "linkedin",
          jobBoardId: jobId,
          company,
          title: jobTitle,
          description: jobDescText,
          descriptionHtml: jobDescHtml,
          wasSuccessful,
        };
        console.info("[info] saving job details into database...");
        await db.insert(jobs).values(jobDetails);
        console.info("[info] saving job details complete");
      }
    } catch (error) {
      console.error("[error] saving job details into database");

      const timestamp = Date.now();
      this.page.screenshot({ path: `${timestamp}-db-save-error.png` });
    }
  }
}

export { LinkedinJobsPage };
