import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { useSettings } from "../settings"
import { StudioScreen } from "../studio-screen"
import { useCamera, useStudio } from "../studio-store"

/*
 * Pick on the map, through the screen. Without a map token the map area
 * still shows the bar, so a pick started there can be finished or
 * cancelled; the clicks a map would make are the store's togglePick.
 */

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(testNetwork()),
}))

beforeEach(() => {
  vi.stubEnv("VITE_MAPBOX_TOKEN", "")
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})
afterEach(() => vi.unstubAllEnvs())

async function pickFromSections() {
  await act(async () => {
    render(<StudioScreen />)
  })
  const user = userEvent.setup()
  const row = screen.getByRole("option", { name: /North line/ })
  await user.pointer({ keys: "[MouseRight]", target: row })
  await user.click(await screen.findByRole("menuitem", { name: "Sections" }))
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Pick on the map",
    })
  )
  return user
}

const bar = () => screen.getByRole("group", { name: "Adding to North line" })

describe("Pick on the map", () => {
  it("folds the modal into a bar that says what a click does", async () => {
    await pickFromSections()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(within(bar()).getByRole("status")).toHaveTextContent(
      "0 picked · click a section to add it, or one of North line's to remove it"
    )
  })

  it("counts the picks, and Done lists them in the modal as New", async () => {
    const user = await pickFromSections()
    act(() => useStudio.getState().togglePick("s-3", false))
    expect(within(bar()).getByRole("status")).toHaveTextContent("1 picked")
    await user.click(within(bar()).getByRole("button", { name: "Done" }))
    const modal = within(await screen.findByRole("dialog"))
    expect(modal.getByText("New · leaves South line")).toBeTruthy()
    expect(modal.getByText("Will add 1 section")).toBeTruthy()
  })

  it("drops the picks on Esc and goes back to the modal", async () => {
    const user = await pickFromSections()
    act(() => useStudio.getState().togglePick("s-3", false))
    await user.keyboard("{Escape}")
    const modal = within(await screen.findByRole("dialog"))
    expect(modal.getByText("No changes yet")).toBeTruthy()
  })
})
