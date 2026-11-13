import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { evidenceNetwork } from "@/test/network"

import { statusCount } from "@/test/status-filter"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * What a person reads about the evidence: what each source does for a claim,
 * the dates as the sources give them, and an end a tool proposes. The map is
 * not drawn here.
 */

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(evidenceNetwork()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))

async function openClaim(attribute: string) {
  await act(async () => {
    render(<StudioScreen />)
  })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole("combobox", { name: "Search pipelines" }),
    "fir to{Enter}"
  )
  const claims = screen.getByRole("group", { name: "Claims of Fir to Gale" })
  const row = within(claims)
    .getAllByRole("treeitem")
    .find((item) => item.textContent?.startsWith(attribute))!
  await user.click(row)
  return {
    user,
    row,
    detail: screen.getByRole("region", { name: `${attribute} of Fir to Gale` }),
  }
}

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("evidence in the right panel", () => {
  it("says what a map does for a claim, its edition and date, and the trace file last", async () => {
    const { detail } = await openClaim("Geometry")
    expect(detail).toHaveTextContent("Holds by June 1931.")
    const sources = within(detail).getByRole("list", { name: "Sources" })
    const source = within(sources).getByRole("button", {
      name: /Invented trunk map, 1931/,
    })
    expect(source).toHaveTextContent("Shown on")
    expect(sources).toHaveTextContent("1931 edition, as of 30 June 1931")
    expect(sources).toHaveTextContent("File")
    expect(sources).toHaveTextContent("traces/1931/base.gpkg")
    // The trace file is not a place in the source.
    expect(sources).not.toHaveTextContent("Where")
  })

  it("keeps Last seen Unknown with the proposed end told, and nothing to decide", async () => {
    const { detail, row } = await openClaim("Last seen")
    expect(row).toHaveTextContent("Unknown")
    expect(row).toHaveTextContent("1 proposal")
    expect(detail).toHaveTextContent(
      "The stitch tool proposes 1931, not on 1937."
    )
    expect(detail).toHaveTextContent("Score 0.99.")
    expect(detail).toHaveTextContent("Confirming cites both editions.")
    // Nothing decides: one button closes, the other only asks the Agent.
    expect(
      within(detail)
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent
        )
    ).toEqual(["Close the claim", "ProposedAsk the Agent about this"])
  })

  it("marks a section with a proposed end as waiting for a decision", async () => {
    await openClaim("Last seen")
    expect(await statusCount("Needs your decision")).toBe(3)
  })
})
