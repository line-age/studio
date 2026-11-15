import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { citationPopupNetwork } from "@/test/network"

import { useSettings } from "../settings"
import { StudioScreen } from "../studio-screen"
import { useCamera, useStudio } from "../studio-store"

/*
 * The citation pop-up: opening it from a claim's source, moving between
 * claims, showing and finding a source, and closing it back to the row that
 * opened it.
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
  return { user }
}

async function openCitation(attribute: string, sourceName: RegExp | string) {
  const { user } = await openClaim(attribute)
  const detail = screen.getByRole("region", {
    name: `${attribute} of Elm to Fir`,
  })
  const sources = within(detail).getByRole("list", { name: "Sources" })
  const source = within(sources).getByRole("button", { name: sourceName })
  await user.click(source)
  return { user, source }
}

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("the citation pop-up", () => {
  it("opens named after the claim and the feature, showing 2 of 2", async () => {
    await openCitation("Diameter", /Invented Gas Review, 1931/)
    const dialog = screen.getByRole("dialog", {
      name: "Diameter of Elm to Fir",
    })
    expect(within(dialog).getByText("2 of 2")).toBeInTheDocument()
  })

  it("disables Previous on the first cited claim, enables Next", async () => {
    await openCitation("Geometry", /Invented trunk map, 1931/)
    const dialog = screen.getByRole("dialog", {
      name: "Geometry of Elm to Fir",
    })
    expect(
      within(dialog).getByRole("button", { name: "Previous claim" })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "Next claim" })
    ).toBeEnabled()
  })

  it("steps to the next claim with Next or ArrowRight, and back with Previous or ArrowLeft", async () => {
    const { user } = await openCitation("Geometry", /Invented trunk map, 1931/)
    const hasDialogNamed = (name: string) =>
      screen.queryByRole("dialog", { name }) !== null
    await user.click(screen.getByRole("button", { name: "Next claim" }))
    expect(hasDialogNamed("Diameter of Elm to Fir")).toBe(true)
    await user.keyboard("{ArrowLeft}")
    expect(hasDialogNamed("Geometry of Elm to Fir")).toBe(true)
    await user.keyboard("{ArrowRight}")
    expect(hasDialogNamed("Diameter of Elm to Fir")).toBe(true)
    expect(screen.getByRole("button", { name: "Next claim" })).toBeDisabled()
  })

  it("ignores ArrowRight and ArrowLeft while focus is in the source list", async () => {
    const { user } = await openCitation("Geometry", /Invented trunk map, 1931/)
    const dialog = screen.getByRole("dialog", {
      name: "Geometry of Elm to Fir",
    })
    const sources = within(dialog).getByRole("list", { name: "Sources" })
    const sourceButton = within(sources).getByRole("button", {
      name: /Invented trunk map, 1931/,
    })
    sourceButton.focus()
    await user.keyboard("{ArrowRight}")
    expect(
      screen.queryByRole("dialog", { name: "Geometry of Elm to Fir" })
    ).toBeInTheDocument()
    await user.keyboard("{ArrowLeft}")
    expect(
      screen.queryByRole("dialog", { name: "Geometry of Elm to Fir" })
    ).toBeInTheDocument()
  })

  it("closes on Esc and returns focus to the row that opened it", async () => {
    const { user, source } = await openCitation(
      "Geometry",
      /Invented trunk map, 1931/
    )
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("closes on Done and returns focus to the row that opened it", async () => {
    const { user, source } = await openCitation(
      "Geometry",
      /Invented trunk map, 1931/
    )
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("shows Open source only when the citation has a web address", async () => {
    const { user } = await openCitation("Geometry", /Invented trunk map, 1931/)
    expect(
      screen.queryByRole("link", { name: "Open source" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next claim" }))
    const link = screen.getByRole("link", { name: "Open source" })
    expect(link).toHaveAttribute("href", "https://example.invalid/review")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })

  it("shows the section on the map and closes, on Show on map", async () => {
    const { user } = await openCitation("Geometry", /Invented trunk map, 1931/)
    await user.click(screen.getByRole("button", { name: "Show on map" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(useStudio.getState().selectedSectionId).toBe("s-1")
  })

  it("shows the open citation's details, including the no-quote scanned map note", async () => {
    await openCitation("Geometry", /Invented trunk map, 1931/)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Shown on")).toBeInTheDocument()
    expect(
      within(dialog).getAllByText("1931 edition, as of 30 June 1931").length
    ).toBeGreaterThan(0)
    expect(
      within(dialog).getByText("No quote, scanned map")
    ).toBeInTheDocument()
  })

  it("shows a cited quote under a Quote row", async () => {
    await openCitation("Diameter", /Invented Gas Review, 1931/)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Quote")).toBeInTheDocument()
    expect(within(dialog).getByText('"12 IN."')).toBeInTheDocument()
  })

  it("gives every icon button an accessible name", async () => {
    await openCitation("Geometry", /Invented trunk map, 1931/)
    const dialog = screen.getByRole("dialog")
    for (const button of within(dialog).getAllByRole("button")) {
      expect(button).toHaveAccessibleName()
    }
  })
})
