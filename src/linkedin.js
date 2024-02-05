const LINKEDIN_URL = "https://linkedin.com"
const LINKEDIN_CREDS = {
    email: process.env.LINKEDIN_EMAIL,
    password: process.env.LINKEDIN_PASSWORD
}

async function handleLinkedinEasyApply (browser) {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(LINKEDIN_URL)

    await page.waitForTimeout(1000)

    await page.getByLabel('Email or phone').fill(LINKEDIN_CREDS.email)
    await page.getByLabel('Password', { exact: true }).fill(LINKEDIN_CREDS.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    const jobsNavBtn = page.getByTitle('Jobs')
    await jobsNavBtn.waitFor()
    await jobsNavBtn.click()

    await page.getByRole('combobox', { name: 'Search by title, skill, or company' }).fill('Software Engineer')
    const locationInput = page.getByLabel('City, state, or zip code').first()
    await locationInput.waitFor()
    await locationInput.fill('Remote')

    await page.waitForTimeout(2000)
    await page.keyboard.press('Enter')


    const jobSearchResultsList = page.locator('.jobs-search-results-list')
    // const jobSearchResultsList = page.locator('.scaffold-layout__list-container')
    await jobSearchResultsList.waitFor()

    // jobSearchResultsList.evaluate((div) => {
    //     console.log(div.querySelectorAll('.job-card-container__link').length)
    // })

    await page.waitForTimeout(2000)
    await jobSearchResultsList.evaluate(async (el) => {
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < el.scrollHeight; i += 100) {
            el.scrollTo(0, i);
            await delay(100);
        }
    });

    await page.waitForTimeout(2000)

    for (const card of await jobSearchResultsList.locator(".job-card-container__link").all()) {
        await card.click()

        await page.waitForTimeout(2000)

        const jobTitle = await page.locator('.job-details-jobs-unified-top-card__job-title-link').textContent()
        const jobDesc = await page.locator('#job-details').textContent()
        
        
        console.log({ jobTitle: jobTitle.trim(), jobDesc: jobDesc.trim() })
    }
}

export { handleLinkedinEasyApply }