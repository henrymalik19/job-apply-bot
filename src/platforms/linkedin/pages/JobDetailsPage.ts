import { Locator, Page } from "playwright";

import { EasyApplyModal } from "./components/EasyApplyModal";

class LinkedinJobDetailsPage {
  private page: Page;

  readonly easyApplyBtn: Locator;
  readonly easyApplyModal: EasyApplyModal;

  constructor(page: Page) {
    this.page = page;
    this.easyApplyModal = new EasyApplyModal(page);

    this.easyApplyBtn = this.page.locator(
      ".jobs-apply-button--top-card button",
    );
  }

  async goTo(url) {
    console.info(`[info] navigating to ${url}`);
    await this.page.goto(url);
    console.info(`[info] navigation complete!`);
  }

  async applyToJob(url) {
    await this.goTo(url);

    console.info("[info] applying to easy apply job...");

    await this.page.waitForTimeout(2000);

    if (await this.easyApplyBtn.isVisible()) {
      console.info("[info] 'Easy Apply' button found");
      await this.easyApplyBtn.click();
      console.info("[info] opening 'Easy Apply' modal...");

      await this.easyApplyModal.apply();
    }
  }
}

export { LinkedinJobDetailsPage };
