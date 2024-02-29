"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedinHomePage = void 0;
class LinkedinHomePage {
    static url = "https://linkedin.com";
    page;
    emailOrPhoneInput;
    passwordInput;
    signInBtn;
    constructor(page) {
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
    async login(email, password) {
        if (await this.checkIfLoggedIn()) {
            console.info("[info] already logged in");
            return true;
        }
        console.info("[info] logging into linkedin...");
        await this.emailOrPhoneInput.fill(email);
        await this.passwordInput.fill(password);
        await this.signInBtn.click();
        await this.page.waitForTimeout(5000); // FOR TESTING
        if (await this.checkIfLoggedIn()) {
            console.info("[info] login successful");
            return true;
        }
        console.info("[info] login failed!");
        return false;
    }
    async checkIfLoggedIn() {
        return (await this.page.url().split("/")[3]) === "feed";
    }
}
exports.LinkedinHomePage = LinkedinHomePage;
