"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIndeedApply = void 0;
async function handleIndeedApply(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://indeed.com");
}
exports.handleIndeedApply = handleIndeedApply;
