"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedinJobDetailsPage = void 0;
const EasyApplyModal_1 = require("./components/EasyApplyModal");
class LinkedinJobDetailsPage {
  page;
  easyApplyBtn;
  easyApplyModal;
  constructor(page) {
    this.page = page;
    this.easyApplyModal = new EasyApplyModal_1.EasyApplyModal(page);
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
exports.LinkedinJobDetailsPage = LinkedinJobDetailsPage;
