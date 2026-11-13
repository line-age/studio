import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/*
 * The status filter lives in the Filters level of the list panel. These open
 * it, read or change it, and go back to the list.
 */

async function inFilters<T>(read: (group: HTMLElement) => Promise<T> | T) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: /^Filters/ }))
  const result = await read(
    screen.getByRole("group", { name: "Sections by status" })
  )
  await user.click(screen.getByRole("button", { name: "Back to the list" }))
  return result
}

/** The count beside a status, "All" or "Needs your decision". */
export function statusCount(name: string): Promise<number> {
  return inFilters((group) => {
    const row = within(group).getByText(name).closest("label")!
    return Number(row.textContent!.slice(name.length).replace(/\D/g, ""))
  })
}

/** Chooses a status ("All" takes it off) or turns "Needs your decision". */
export function pickStatus(name: string): Promise<void> {
  return inFilters(async (group) => {
    const row = within(group).getByText(name).closest("label")!
    await userEvent.setup().click(row)
  })
}
