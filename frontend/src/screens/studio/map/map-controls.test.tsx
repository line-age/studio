import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { testNetwork } from "@/test/network"

import { StudioDataProvider, useVisiblePipelines } from "../studio-data"
import { useStudio } from "../studio-store"
import { FollowMapToggle } from "./follow-map-toggle"
import { LayersControl } from "./layers-control"

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
            <LayersControl />
            <FollowMapToggle />
            <Shown />
          </StudioDataProvider>
        </TooltipProvider>
      </Suspense>
    )
  })
}

beforeEach(() => {
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("map controls", () => {
  it("switches a layer off from the layers button", async () => {
    const user = userEvent.setup()
    await renderControls()
    await user.click(screen.getByRole("button", { name: "Map layers" }))
    expect(screen.getByText("Show on the map")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Show Proposed paths on the map" })
    )
    expect(useStudio.getState().layers.proposed).toBe(false)
    expect(useStudio.getState().layers.pipelines).toBe(true)
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
    expect(screen.getByRole("status")).toHaveTextContent("3")

    await user.click(toggle)
    expect(screen.getByRole("status")).toHaveTextContent("1")
  })
})
