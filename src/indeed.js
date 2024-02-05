async function handleIndeedApply() {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("https://indeed.com")
}

export { handleIndeedApply }