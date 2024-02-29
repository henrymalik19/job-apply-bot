import { Locator, Page } from "playwright";

import { APP_ENV } from "../../../constants";

class LinkedinHomePage {
  static readonly url = "https://linkedin.com";

  private page: Page;
  readonly emailOrPhoneInput: Locator;
  readonly passwordInput: Locator;
  readonly signInBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.emailOrPhoneInput = this.page.getByLabel("Email or phone");
    this.passwordInput = this.page.getByLabel("Password", { exact: true });
    this.signInBtn = this.page.getByRole("button", { name: "Sign in" });
  }

  async goto() {
    console.info(`[info] navigating to ${LinkedinHomePage.url}`);
    await this.page.goto(LinkedinHomePage.url);
    console.info(`[info] navigation complete!`);
  }

  async login(email: string, password: string) {
    if (await this.checkIfLoggedIn()) {
      console.info("[info] already logged in");
      return;
    }

    console.info("[info] logging into linkedin...");
    await this.page.screenshot({ path: "/tmp/playwright-images.png" });
    await this.emailOrPhoneInput.fill(email);
    await this.passwordInput.fill(password);

    await this.signInBtn.click();

    await this.page.waitForTimeout(APP_ENV === "local" ? 15000 : 3000);

    if (await this.checkIfLoggedIn()) {
      console.info("[info] login successful");
      return;
    }

    await this.page.screenshot({ path: `./${Date.now()}.png` });
    throw new Error("login failed!");
  }

  private async checkIfLoggedIn() {
    return (await this.page.url().split("/")[3]) === "feed";
  }
}

export { LinkedinHomePage };
