import { expect, test, type Page } from "@playwright/test"

/*
 * The flows a person cannot do without, on the invented sample. What each
 * part does in detail is a story or an RTL test; these check the parts work
 * together in the built app.
 */

// A returning visitor: the Help tour, which starts on a first visit, is seen.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("studio.tour-seen", "1"))
})

const scopeSwitch = (page: Page) => page.getByRole("group", { name: "Show" })

/** How many sections the list says it holds: "38 sections" → 38. */
async function sectionCount(page: Page) {
  const header = page.getByText(/^\d[\d,]* sections?$/).first()
  return Number((await header.innerText()).replace(/\D/g, ""))
}

test("Studio opens on All, with the whole network listed", async ({ page }) => {
  await page.goto("/")
  await expect(
    scopeSwitch(page).getByRole("button", { name: "All" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("listbox", { name: "Network" })).toBeVisible()
  await expect(page.getByText("Nothing selected")).toBeVisible()
})

test("the switch changes the list, and a link keeps it", async ({ page }) => {
  await page.goto("/")
  const all = await sectionCount(page)
  await scopeSwitch(page).getByRole("button", { name: "Unplaced" }).click()
  await expect(page).toHaveURL(/[?&]sc=unplaced/)
  await expect(page.getByRole("listbox", { name: "Unplaced" })).toBeVisible()
  expect(await sectionCount(page)).toBeLessThan(all)

  // The address opens the same view.
  await page.reload()
  await expect(
    scopeSwitch(page).getByRole("button", { name: "Unplaced" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("listbox", { name: "Unplaced" })).toBeVisible()
})

test("a length filter narrows the list, and its chip takes it off", async ({
  page,
}) => {
  await page.goto("/")
  const all = await sectionCount(page)
  await page.getByRole("button", { name: /^Filters/ }).click()
  await page.getByRole("spinbutton", { name: "Length from, km" }).fill("100")
  await page.getByRole("button", { name: /^Show \d+ sections?$/ }).click()

  const chips = page.getByRole("group", { name: "Filters in force" })
  await expect(chips).toContainText("100 km or longer")
  await expect(page).toHaveURL(/[?&]len=/)
  const narrowed = await sectionCount(page)
  expect(narrowed).toBeLessThan(all)

  await chips
    .getByRole("button", { name: "Remove the filter: 100 km or longer" })
    .click()
  await expect(chips).toBeHidden()
  expect(await sectionCount(page)).toBe(all)
})

test("choosing a pipeline shows its sections on the right, across a switch", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByRole("option", { name: /Calder Valley/ })
    .first()
    .click()
  const right = page
    .getByRole("complementary", { name: "Properties" })
    .getByRole("heading", { name: "Calder Valley" })
  await expect(right).toBeVisible()
  await expect(page.getByText("Nothing selected")).toBeHidden()

  // The switch never changes the selection.
  await scopeSwitch(page).getByRole("button", { name: "Unplaced" }).click()
  await expect(right).toBeVisible()
})

test("a pipeline's sections change in a modal, and the list follows", async ({
  page,
}) => {
  await page.goto("/")
  const row = page.getByRole("option").filter({ hasText: "Calder Valley" })
  await row.click({ button: "right" })
  // A pipeline is edited, never made again.
  await expect(
    page.getByRole("menuitem", { name: "Make pipeline" })
  ).toHaveCount(0)
  await page.getByRole("menuitem", { name: "Sections" }).click()
  const modal = page.getByRole("dialog", { name: "Sections of Calder Valley" })
  await modal
    .getByRole("button", { name: /^Remove / })
    .first()
    .click()
  await expect(modal.getByText("Will remove 1 section")).toBeVisible()
  await modal.getByRole("button", { name: "Save changes" }).click()
  await expect(modal).toBeHidden()
  await expect(row).toContainText("/6")
})

test("a pipeline is renamed in Edit pipeline", async ({ page }) => {
  await page.goto("/")
  await page
    .getByRole("option")
    .filter({ hasText: "Tolland" })
    .click({ button: "right" })
  await page.getByRole("menuitem", { name: "Edit pipeline" }).click()
  const modal = page.getByRole("dialog", { name: "Edit pipeline" })
  await modal.getByRole("textbox", { name: "Name" }).fill("Tolland trunk")
  await modal.getByRole("button", { name: "Save" }).click()
  await expect(modal).toBeHidden()
  await expect(
    page.getByRole("option").filter({ hasText: "Tolland trunk" })
  ).toBeVisible()
})
