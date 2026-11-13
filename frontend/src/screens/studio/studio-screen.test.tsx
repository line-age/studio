import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { readSettings, useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

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
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
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

    await user.click(screen.getByRole("button", { name: /Agent/ }))
    expect(sidePanels()).toEqual([
      { name: "agent", open: true },
      { name: "Properties", open: true },
    ])
  })
})

describe("a shared link", () => {
  it("opens on the same edition, status, filters and section", async () => {
    window.history.replaceState(
      null,
      "",
      "/?e=ed-1937&s=not-started&u=Owner&v=0&sel=s-2"
    )
    await renderScreen()
    const s = useStudio.getState()
    expect(s.editionId).toBe("ed-1937")
    expect(s.onlyInView).toBe(false)
    expect([...s.selection]).toEqual(["s-2"])
    expect(
      screen.getByRole("button", { name: /^Not started/ })
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Unknown owner")
    // The address stays as it was: nothing was lost on the way in.
    expect(window.location.search).toBe(
      "?e=ed-1937&s=not-started&u=Owner&v=0&sel=s-2"
    )
  })

  it("ignores what the data does not have, and a broken link", async () => {
    window.history.replaceState(
      null,
      "",
      "/?e=ed-1800&s=finished&co=Nobody+Ltd&u=Colour&sel=s-999&m=x"
    )
    await renderScreen()
    const s = useStudio.getState()
    expect(s.editionId).toBeNull()
    expect(s.status).toBe("all")
    expect(s.companies).toEqual([])
    expect(s.unknownIn).toEqual([])
    expect(s.selection.size).toBe(0)
    expect(screen.queryByRole("group", { name: "Filters in force" })).toBeNull()
    expect(screen.getByRole("listbox", { name: "Sections" })).toBeVisible()
  })
})

describe("Settings", () => {
  it("recounts every status at once when the rule changes, and keeps it", async () => {
    const user = userEvent.setup()
    await renderScreen()
    // The dialog hides the page behind it from assistive technology.
    const done = () =>
      screen.getByRole("button", { name: /^Done/, hidden: true })
    // Owner, Diameter and Build date are asked for: nothing is done yet.
    expect(done()).toHaveTextContent("Done0")

    await user.click(screen.getByRole("button", { name: "Settings" }))
    const dialog = screen.getByRole("dialog", { name: "Settings" })
    const rule = within(dialog).getByRole("group", {
      name: "Attributes that must be cited",
    })
    expect(
      within(rule).getByRole("checkbox", { name: /Geometry/ })
    ).toHaveAttribute("aria-disabled", "true")
    await user.click(within(rule).getByRole("checkbox", { name: "Build date" }))

    // No reload: the counts behind the dialog have already changed.
    expect(done()).toHaveTextContent("Done2")
    expect(readSettings().requiredAttributes).toEqual(["Owner", "Diameter"])

    // The map's lines are a setting too.
    await user.click(
      within(
        within(dialog).getByRole("radiogroup", { name: "Line for In progress" })
      ).getByRole("radio", { name: "Solid" })
    )
    expect(readSettings().lineStyle["in-progress"]).toBe("solid")
  })

  it("sits immediately to the left of Help", async () => {
    await renderScreen()
    const settings = screen.getByRole("button", { name: "Settings" })
    expect(settings.nextElementSibling).toHaveTextContent("Help")
  })
})
