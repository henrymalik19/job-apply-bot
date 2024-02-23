"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Linkedin = void 0;
// import { chromium } from "playwright";
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const utils_1 = require("../../utils");
const HomePage_1 = require("./pages/HomePage");
const JobDetailsPage_1 = require("./pages/JobDetailsPage");
const JobsPage_1 = require("./pages/JobsPage");
playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
class Linkedin {
    static async handleSearchForJobs({ userId, email, password, jobTitle, city, state, country, datePostedFilter, onsiteRemoteFilter, }) {
        if (!email || !password)
            throw new Error("Missing Linkedin Credentials (email and/or password)");
        const browser = await playwright_extra_1.chromium.launch({
            headless: false,
        });
        try {
            const storageStatePath = `./storage-states/linkedin/${userId}-storage-state.json`;
            const storageStateExists = await (0, utils_1.doesFileExist)(storageStatePath);
            const context = await browser.newContext({
                ...(storageStateExists && { storageState: storageStatePath }),
            });
            const page = await context.newPage();
            const linkedinHomePage = new HomePage_1.LinkedinHomePage(page);
            const linkedinJobsPage = new JobsPage_1.LinkedinJobsPage(page);
            await linkedinHomePage.goto();
            await linkedinHomePage.login(email, password);
            await context.storageState({ path: storageStatePath });
            await linkedinJobsPage.goto();
            const jobsDetails = await linkedinJobsPage.searchForJobs({
                job: jobTitle,
                city,
                state,
                country,
                datePostedFilter,
                onsiteRemoteFilter,
            });
            return jobsDetails;
        }
        finally {
            await browser.close();
        }
    }
    static async handleApplyForJobs({ userId, jobUrl, email, password, }) {
        if (!email || !password)
            throw new Error("Missing Linkedin Credentials (email and/or password)");
        const browser = await playwright_extra_1.chromium.launch({
            headless: false,
        });
        try {
            const storageStatePath = `./storage-states/linkedin/${userId}-storage-state.json`;
            const storageStateExists = await (0, utils_1.doesFileExist)(storageStatePath);
            const context = await browser.newContext({
                ...(storageStateExists && { storageState: storageStatePath }),
            });
            const page = await context.newPage();
            const linkedinHomePage = new HomePage_1.LinkedinHomePage(page);
            const linkedinJobDetailsPage = new JobDetailsPage_1.LinkedinJobDetailsPage(page);
            await linkedinHomePage.goto();
            await linkedinHomePage.login(email, password);
            await context.storageState({ path: storageStatePath });
            await linkedinJobDetailsPage.applyToJob(jobUrl);
        }
        finally {
            await browser.close();
        }
    }
}
exports.Linkedin = Linkedin;
