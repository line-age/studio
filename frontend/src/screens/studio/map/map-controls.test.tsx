import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { testNetwork } from "@/test/network"

import { StudioDataProvider, useVisiblePipelines } from "../studio-data"
import { useStudio } from "../studio-store"
import { FollowMapToggle } from "./follow-map-toggle"
import { MapKey } from "./map-key"

function Shown() {
  return <output>{useVisiblePipelines().length}</output>
}

async function renderControls() {
  const network = Promise.resolve(testNetwork())
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <TooltipProvider>
          <StudioDataProvider network={network}>
            <MapKey />
            <FollowMapToggle />
            <Shown />
          </StudioDataProvider>
        </TooltipProvider>
      </Suspense>
    )
  })
}

beforeEach(() => {
  localStorage.clear()
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("map controls", () => {
  it("says how each line is drawn, with an eye on the two that can hide", async () => {
    const user = userEvent.setup()
    await renderControls()
    await user.click(screen.getByRole("button", { name: "Map key" }))
    for (const words of [
      "Sections in a pipeline",
      "Sections in no pipeline",
      "Proposed path or end",
      "Left out by the filters",
      "Selected",
    ]) {
      expect(screen.getByText(words)).toBeVisible()
    }
    // Only the proposed paths and the faint lines have an eye.
    expect(
      screen.getAllByRole("button", { name: /^Show .* on the map$/ })
    ).toHaveLength(2)

    const proposed = screen.getByRole("button", {
      name: "Show proposed paths and ends on the map",
    })
    expect(proposed).toHaveAttribute("aria-pressed", "true")
    await user.click(proposed)
    expect(useStudio.getState().layers.proposed).toBe(false)

    // What the filters hide is not drawn until asked for.
    const faint = screen.getByRole("button", {
      name: "Show sections left out by the filters on the map",
    })
    expect(faint).toHaveAttribute("aria-pressed", "false")
    await user.click(faint)
    expect(useStudio.getState().layers.faint).toBe(true)
  })

  it("says every section is drawn solid, with no line to choose", async () => {
    const user = userEvent.setup()
    await renderControls()
    await user.click(screen.getByRole("button", { name: "Map key" }))
    expect(screen.queryByText("Solid")).toBeNull()
    expect(screen.queryByText("Dotted")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Change how lines are drawn" })
    ).toBeNull()
    expect(screen.getByText("Sections in a pipeline")).toBeVisible()
  })

  it("turns the list following the map off and on again", async () => {
    const user = userEvent.setup()
    await renderControls()
    // The map shows only the north: one pipeline is in view.
    act(() => useStudio.getState().setView([-1, 9, 3, 12]))
    const toggle = screen.getByRole("button", { name: "List follows the map" })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("status")).toHaveTextContent("1")

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    // The two pipelines, the proposed one and the edition of what is in none.
    expect(screen.getByRole("status")).toHaveTextContent("4")

    await user.click(toggle)
    expect(screen.getByRole("status")).toHaveTextContent("1")
  })
})
