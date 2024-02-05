import 'dotenv/config'

import { chromium } from "playwright"
import { handleLinkedinEasyApply } from './linkedin'
import { handleIndeedApply } from './indeed'

async function main() {
    const browser = await chromium.launch({
        headless: false,
    })

    await Promise.all([
        handleLinkedinEasyApply(browser),
        handleIndeedApply(browser),
    ])
}

main().catch(e => {
    console.error(e)
})