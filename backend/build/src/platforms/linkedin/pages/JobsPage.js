"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedinJobsPage = void 0;
const utils_1 = require("../../../utils");
const EasyApplyModal_1 = require("./components/EasyApplyModal");
class LinkedinJobsPage {
  static url = "https://linkedin.com/jobs";
  page;
  jobInput;
  locationInput;
  jobSearchResultsList;
  companyLink;
  bottomPageNavbar;
  jobTitleHeader;
  jobDescriptionContainer;
  easyApplyBtn;
  openAllFiltersBtn;
  dateFilterBtn;
  onsiteRemoteFilterBtn;
  easyApplyFilterBtn;
  easyApplyModal;
  constructor(page) {
    this.page = page;
    this.easyApplyModal = new EasyApplyModal_1.EasyApplyModal(page);
    this.jobInput = this.page.getByRole("combobox", {
      name: "Search by title, skill, or company",
    });
    this.locationInput = this.page
      .getByLabel("City, state, or zip code")
      .first();
    this.jobSearchResultsList = this.page.locator(".jobs-search-results-list");
    this.companyLink = this.page.locator(
      ".job-details-jobs-unified-top-card__primary-description-without-tagline > a",
    );
    this.bottomPageNavbar = this.page.locator(
      ".jobs-search-results-list__pagination",
    );
    this.jobTitleHeader = this.page.locator(
      ".job-details-jobs-unified-top-card__job-title",
    );
    this.jobDescriptionContainer = this.page.locator("#job-details");
    this.easyApplyBtn = this.page.locator(
      ".job-details-jobs-unified-top-card__container--two-pane .jobs-apply-button",
    );
    this.openAllFiltersBtn = this.page.getByRole("button", {
      name: "Show all filters. Clicking this button displays all available filter options.",
    });
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
  async gotoSearchPage(page) {
    console.info(`[info] navigating to search results page ${page}`);
    const nxtPageBtn = await this.bottomPageNavbar.getByLabel(`Page ${page}`, {
      exact: true,
    });
    await nxtPageBtn.click();
    console.info(`[info] navigation complete!`);
  }
  async handleDatePostedFilter(datePostedFilter) {
    const datePostedFilterLabelMap = {
      past24Hours: "24 hours",
      pastWeek: "week",
      pastMonth: "month",
    };
    await this.page.waitForTimeout(3000);
    console.info(
      `[info] filtering to jobs posted in the past ${datePostedFilterLabelMap[datePostedFilter]}...`,
    );
    await this.dateFilterBtn.click();
    const filterDropdown = await this.page.getByRole("group", {
      name: "Filter results by: Date posted",
    });
    let label = null;
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
  async handleOnsiteRemoteFilter(onsiteRemoteFilter) {
    const onsiteRemoteFilterLabelMap = {
      remote: "remote",
      hybrid: "hybrid",
      onsite: "on-site",
    };
    await this.page.waitForTimeout(3000);
    console.info(
      `[info] filtering to only ${onsiteRemoteFilterLabelMap[onsiteRemoteFilter]} jobs...`,
    );
    await this.onsiteRemoteFilterBtn.click();
    const filterDropdown = await this.page.getByRole("group", {
      name: "Filter results by: Remote",
    });
    let label = null;
    for (const labelEl of await filterDropdown
      .locator("label p span:first-of-type")
      .all()) {
      if (
        (await labelEl.textContent())
          ?.trim()
          .toLowerCase()
          .includes(onsiteRemoteFilterLabelMap[onsiteRemoteFilter])
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
    await this.page.waitForTimeout(3000);
    console.info(`[info] filtering to only 'Easy Apply' jobs...`);
    if (await this.easyApplyFilterBtn.isVisible()) {
      await this.easyApplyFilterBtn.click();
    } else {
      await this.openAllFiltersBtn.click();
      await this.page.waitForTimeout(2000);
      const allFiltersDialog = await this.page.getByRole("dialog", {
        name: "All filters",
      });
      await allFiltersDialog
        .locator(".artdeco-modal__content")
        .evaluate(utils_1.scrollToBottom);
      const li = await allFiltersDialog
        .locator("li fieldset")
        .filter({ hasText: "Easy Apply filter" });
      const input = await li.locator("input");
      await input.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(2000);
      await input.check({ force: true });
      await this.page.waitForTimeout(2000);
      const btns = await allFiltersDialog.getByRole("button").all();
      for (const btn of btns) {
        if ((await btn.textContent())?.trim().toLowerCase().includes("show")) {
          await btn.click();
          break;
        }
      }
    }
  }
  async searchForJobs({
    job,
    city,
    state,
    country,
    datePostedFilter,
    onsiteRemoteFilter,
  }) {
    console.info("[info] beginning job search...");
    await this.jobInput.fill(job);
    await this.locationInput.waitFor();
    await this.locationInput.fill(
      `${city ? `${city},` : ""} ${state ? ` ${state},` : ""} ${country}`,
    );
    await this.page.waitForTimeout(2000);
    await this.page.keyboard.press("Enter");
    if (datePostedFilter) await this.handleDatePostedFilter(datePostedFilter);
    if (onsiteRemoteFilter)
      await this.handleOnsiteRemoteFilter(onsiteRemoteFilter);
    await this.handleEasyApplyFilter();
    const jobCards = await this.getSearchedJobs();
    const jobsDetails = [];
    for (const jobCard of jobCards) {
      await this.page.waitForTimeout(2000);
      await jobCard.click();
      await this.page.waitForTimeout(2000);
      const appliedBanner = (
        await this.page
          .locator(
            ".jobs-details__main-content .artdeco-inline-feedback span.artdeco-inline-feedback__message",
          )
          .all()
      ).find(async (s) =>
        (await s.textContent())?.trim().toLowerCase().includes("applied"),
      );
      if (appliedBanner && (await appliedBanner.isVisible())) {
        console.info("[info] already applied to this job. Skipping...");
        continue;
      }
      if (
        (await this.companyLink.isVisible()) &&
        (await this.jobTitleHeader.isVisible())
      ) {
        const company = (await this.companyLink.textContent())?.trim();
        const companyUrl = (
          await this.companyLink.getAttribute("href")
        )?.trim();
        const jobTitle = (
          await this.jobTitleHeader
            .locator(".job-details-jobs-unified-top-card__job-title-link")
            .textContent()
        )?.trim();
        const urlPath = (
          await this.jobTitleHeader.locator("a").getAttribute("href")
        )?.trim();
        const params = new URLSearchParams(await this.page.url().split("?")[1]);
        const jobId = params.get("currentJobId");
        // postedAt: new Date(job.postedAt),
        if (company && companyUrl && jobTitle && urlPath) {
          jobsDetails.push({
            platformJobId: jobId,
            title: jobTitle,
            url: `https://www.linkedin.com${urlPath}`,
            company,
            companyUrl,
          });
        }
      }
    }
    return jobsDetails;
  }
  async getSearchedJobs() {
    await this.jobSearchResultsList.waitFor();
    await this.page.waitForTimeout(2000);
    await this.jobSearchResultsList.evaluate(utils_1.scrollToBottom);
    await this.page.waitForTimeout(2000);
    const jobCards = await this.jobSearchResultsList
      .locator(".jobs-search-results__list-item")
      .all();
    return jobCards;
  }
}
exports.LinkedinJobsPage = LinkedinJobsPage;
