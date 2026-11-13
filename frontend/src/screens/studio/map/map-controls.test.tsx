import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { testNetwork } from "@/test/network"

import { StudioDataProvider, useVisiblePipelines } from "../studio-data"
import { useStudio } from "../studio-store"
import { useSettingsOpen } from "../settings"
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
  useSettingsOpen.setState({ open: false })
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("map controls", () => {
  it("says how each line is drawn, with an eye on the two that can hide", async () => {
    const user = userEvent.setup()
    await renderControls()
    await user.click(screen.getByRole("button", { name: "Map key" }))
    for (const words of [
      "Sufficient or done",
      "Not started or in progress",
      "Proposed by a tool · 0 waiting",
      "Hidden by the filters",
      "Selected",
    ]) {
      expect(screen.getByText(words)).toBeVisible()
    }
    // Only the proposed paths and the faint lines have an eye.
    expect(
      screen.getAllByRole("button", { name: /^Show .* on the map$/ })
    ).toHaveLength(2)

    const proposed = screen.getByRole("button", {
      name: "Show proposed paths on the map",
    })
    expect(proposed).toHaveAttribute("aria-pressed", "true")
    await user.click(proposed)
    expect(useStudio.getState().layers.proposed).toBe(false)

    // What the filters hide is not drawn until asked for.
    const faint = screen.getByRole("button", {
      name: "Show sections hidden by the filters on the map",
    })
    expect(faint).toHaveAttribute("aria-pressed", "false")
    await user.click(faint)
    expect(useStudio.getState().layers.faint).toBe(true)
  })

  it("opens Settings from the key, where the lines are chosen", async () => {
    const user = userEvent.setup()
    await renderControls()
    await user.click(screen.getByRole("button", { name: "Map key" }))
    await user.click(
      screen.getByRole("button", { name: "Change how lines are drawn" })
    )
    expect(useSettingsOpen.getState().open).toBe(true)
    expect(screen.queryByText("Map key")).not.toBeInTheDocument()
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
