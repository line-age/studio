import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { citationPopupNetwork } from "@/test/network"

import { StudioScreen } from "../studio-screen"
import { useCamera, useStudio } from "../studio-store"

/*
 * The sources pop-up: a click on a claim in the right panel opens where that
 * one value comes from (Figma section 21). Its other claims are one line each,
 * and a click swaps the pop-up to that claim. It closes back to the row.
 */

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(citationPopupNetwork()),
}))
vi.mock("../map/map-area", () => ({ MapArea: () => null }))

async function openClaim(attribute: string) {
  await act(async () => {
    render(<StudioScreen />)
  })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole("combobox", { name: "Search name or code" }),
    "elm to{Enter}"
  )
  const claims = screen.getByRole("group", { name: "Claims of Elm to Fir" })
  const row = within(claims)
    .getAllByRole("treeitem")
    .find((item) => item.textContent?.startsWith(attribute))!
  await user.click(row)
  return { user, row }
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

const dialog = () => screen.getByRole("dialog")
const sources = () => within(dialog()).getByRole("list", { name: "Sources" })

describe("the sources pop-up", () => {
  it("opens on a click on a claim, named after the claim and its value", async () => {
    await openClaim("Diameter")
    expect(dialog()).toHaveAccessibleName("Diameter: 12 in")
    expect(dialog()).toHaveTextContent("Elm to Fir")
    expect(dialog()).toHaveTextContent(/\d+ sources?/)
    expect(within(sources()).getAllByRole("listitem").length).toBeGreaterThan(0)
  })

  it("shows that claim's sources only, and its other claims one line each", async () => {
    await openClaim("Diameter")
    expect(sources()).not.toHaveTextContent("Invented trunk map, 1931")
    const others = within(dialog()).getByRole("navigation", {
      name: "Other claims of this section",
    })
    expect(
      within(others).getByRole("button", { name: /^Geometry/ })
    ).toBeVisible()
    expect(
      within(others).queryByRole("button", { name: /^Diameter/ })
    ).toBeNull()
  })

  it("swaps to another claim in place, with no stepping", async () => {
    const { user } = await openClaim("Diameter")
    expect(
      screen.queryByRole("button", { name: /Previous|Next/ })
    ).not.toBeInTheDocument()
    const others = within(dialog()).getByRole("navigation", {
      name: "Other claims of this section",
    })
    await user.click(within(others).getByRole("button", { name: /^Geometry/ }))
    expect(dialog()).toHaveAccessibleName(/^Geometry/)
    expect(sources()).toHaveTextContent("Invented trunk map, 1931")
  })

  it("closes on Esc and returns focus to the row that opened it", async () => {
    const { user, row } = await openClaim("Geometry")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(row).toHaveFocus()
  })

  it("closes on Done and returns focus to the row that opened it", async () => {
    const { user, row } = await openClaim("Geometry")
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(row).toHaveFocus()
  })

  it("links to a source only where that source has a web address", async () => {
    await openClaim("Geometry")
    expect(within(sources()).queryByRole("link")).toBeNull()
    const { user } = { user: userEvent.setup() }
    const others = within(dialog()).getByRole("navigation", {
      name: "Other claims of this section",
    })
    await user.click(within(others).getByRole("button", { name: /^Diameter/ }))
    const link = within(sources()).getByRole("link", { name: "Open source" })
    expect(link).toHaveAttribute("href", "https://example.invalid/review")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })

  it("shows the section on the map and closes, on Show on map", async () => {
    const { user } = await openClaim("Geometry")
    await user.click(screen.getByRole("button", { name: "Show on map" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(useStudio.getState().selectedSectionId).toBe("s-1")
  })

  it("says what a map does for a claim, its edition, that a scan has no quote, and that a map is no build date", async () => {
    await openClaim("Geometry")
    expect(
      within(sources()).getByText("Shown on · 1931 edition, as of 30 June 1931")
    ).toBeInTheDocument()
    expect(within(sources()).getByText("No quote, scanned map")).toBeVisible()
    expect(dialog()).toHaveTextContent("It does not say when it was built.")
  })

  it("shows the words a source quotes", async () => {
    await openClaim("Diameter")
    expect(within(sources()).getByText('"12 IN."')).toBeInTheDocument()
  })

  it("shows a source's title once and whole", async () => {
    await openClaim("Length")
    const titles = within(dialog()).getAllByText(
      /Invented Review of Regional Gas/
    )
    expect(titles).toHaveLength(1)
    expect(titles[0].className).toContain("break-words")
  })

  it("gives every button an accessible name", async () => {
    await openClaim("Geometry")
    for (const button of within(dialog()).getAllByRole("button")) {
      expect(button).toHaveAccessibleName()
    }
  })
})
