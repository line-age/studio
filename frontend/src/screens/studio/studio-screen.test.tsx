import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { StudioScreen } from "./studio-screen"
import { useStudio } from "./studio-store"

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(testNetwork()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))

async function renderScreen() {
  await act(async () => {
    render(<StudioScreen />)
  })
}

// A hidden panel stays in the page, out of the accessibility tree.
const sidePanels = () =>
  [...document.querySelectorAll("aside")].map((panel) => ({
    name: panel.getAttribute("aria-label"),
    open: panel.getAttribute("aria-hidden") !== "true",
  }))

beforeEach(() => {
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("Studio side panels", () => {
  it("hides both side panels with one button and brings both back", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    expect(sidePanels()).toEqual([
      { name: "pipelines", open: true },
      { name: "Properties", open: true },
    ])

    await user.click(
      screen.getByRole("button", { name: "Hide the side panels" })
    )
    expect(sidePanels().map((panel) => panel.open)).toEqual([false, false])
    expect(screen.getByRole("navigation", { name: "Panels" })).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "Show the side panels" })
    )
    expect(sidePanels().map((panel) => panel.open)).toEqual([true, true])
    expect(
      screen.queryByRole("button", { name: "Show the side panels" })
    ).not.toBeInTheDocument()
  })

  it("keeps the panels hidden when the selection changes, until a rail item is pressed", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(
      screen.getByRole("button", { name: "Hide the side panels" })
    )

    act(() => useStudio.getState().select(["s-1"]))
    expect(sidePanels().map((panel) => panel.open)).toEqual([false, false])

    await user.click(screen.getByRole("button", { name: /Filters/ }))
    expect(sidePanels()).toEqual([
      { name: "filters", open: true },
      { name: "Properties", open: true },
    ])
  })
})
