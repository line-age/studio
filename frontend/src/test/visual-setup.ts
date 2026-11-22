import { afterEach, expect } from "vitest"
import { page } from "vitest/browser"

/*
 * The visual test (`pnpm test:visual`): after each story has rendered and its
 * play function passed, the page is compared with the approved screenshot in
 * `visual/`. Approved screenshots are made on Linux, in the Playwright image
 * CI runs in (`pnpm test:visual:update` says how), since fonts draw a little
 * differently on each system.
 */
afterEach(async ({ task }) => {
  if (task.result?.state === "fail") return
  await expect
    .element(page.elementLocator(document.body))
    .toMatchScreenshot(task.name.replace(/[^\w-]+/g, "-"))
})
