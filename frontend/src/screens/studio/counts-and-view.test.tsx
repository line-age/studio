import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense, type ReactNode } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { FollowMapToggle } from "./map/follow-map-toggle"
import { PanelWidthContext } from "./panel-width-context"
import { PipelinesPanel } from "./panels/pipelines-panel"
import { useSettings } from "./settings"
import { StudioDataProvider } from "./studio-data"
import { useStudio } from "./studio-store"
import { TooltipProvider } from "@/components/ui/tooltip"

/*
 * The status counts are the whole edition; only the list follows the map,
 * and it says how much of the whole it shows. A list open as a table holds
 * everything (requirements R1 to R3, studio polish, 2026-11-13).
 */

/** A view round North line only; South line and the loose section are out. */
const NORTH_ONLY: [number, number, number, number] = [-1, 9, 3, 12]

const network = () => Promise.resolve(testNetwork())

function Screen({
  data,
  wide,
}: {
  data: ReturnType<typeof network>
  wide: boolean
}) {
  return (
    <Suspense fallback="Loading">
      <TooltipProvider>
        <LeftPanelContext
          value={{
            panel: "pipelines",
            open: true,
            openPanel: () => {},
            togglePanel: () => {},
            toggleOpen: () => {},
          }}
        >
          <PanelWidthContext
            value={{
              width: wide ? 760 : 300,
              min: 300,
              wide,
              toggleWide: () => {},
            }}
          >
            <StudioDataProvider network={data}>
              <PipelinesPanel />
              <FollowMapToggle />
            </StudioDataProvider>
          </PanelWidthContext>
        </LeftPanelContext>
      </TooltipProvider>
    </Suspense>
  )
}

/** Renders the list; the returned function widens it into a table or back. */
async function renderList({ wide = false } = {}) {
  const data = network()
  let rerender: (ui: ReactNode) => void = () => {}
  await act(async () => {
    rerender = render(<Screen data={data} wide={wide} />).rerender
  })
  return (next: boolean) =>
    act(() => rerender(<Screen data={data} wide={next} />))
}

const allCount = () =>
  within(screen.getByRole("group", { name: "Sections by status" })).getByRole(
    "button",
    { name: /^All/ }
  ).textContent

const rows = () =>
  within(screen.getByRole("listbox", { name: "Pipelines" })).getAllByRole(
    "option"
  )

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("Counts and the map view", () => {
  it("keeps the status counts whole when the map moves; only the list follows", async () => {
    await renderList()
    const whole = allCount()
    expect(rows()).toHaveLength(3)

    act(() => useStudio.getState().setView(NORTH_ONLY))

    expect(allCount()).toBe(whole)
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent("North line")
  })

  it("says in the list header how many of the whole are in view", async () => {
    await renderList()
    act(() => useStudio.getState().setView(NORTH_ONLY))
    // The Pipelines list counts pipelines.
    expect(screen.getByText("1 of 3 in view")).toBeInTheDocument()

    // The Sections list counts sections, of the whole edition.
    act(() => useStudio.getState().setList("sections"))
    const total = Number(allCount()?.replace(/\D/g, ""))
    expect(screen.getByText(`2 of ${total} in view`)).toBeInTheDocument()
  })

  it("counts the whole edition in the header when the list does not follow", async () => {
    await renderList()
    act(() => {
      useStudio.getState().setView(NORTH_ONLY)
      useStudio.getState().setOnlyInView(false)
    })

    expect(screen.getByText("3 pipelines")).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    act(() => useStudio.getState().setList("sections"))
    const total = Number(allCount()?.replace(/\D/g, ""))
    expect(screen.getByText(`${total} sections`)).toBeInTheDocument()
  })

  it("holds everything while the list is a table, and shows following as paused", async () => {
    await renderList({ wide: true })
    act(() => useStudio.getState().setView(NORTH_ONLY))

    expect(rows()).toHaveLength(3)
    const toggle = screen.getByRole("button", { name: "List follows the map" })
    // The person's choice stands; it only waits.
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(toggle).toHaveAttribute("data-paused")
    expect(useStudio.getState().onlyInView).toBe(true)
  })

  it("follows the map again when the table goes back to a list", async () => {
    const setWide = await renderList({ wide: true })
    act(() => useStudio.getState().setView(NORTH_ONLY))
    expect(rows()).toHaveLength(3)

    setWide(false)

    expect(useStudio.getState().tableOpen).toBe(false)
    expect(rows()).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "List follows the map" })
    ).not.toHaveAttribute("data-paused")
  })

  it("does not change the status counts when the person filters by a status", async () => {
    const user = userEvent.setup()
    await renderList()
    const whole = allCount()
    await user.click(screen.getByRole("button", { name: /^Not started/ }))
    expect(allCount()).toBe(whole)
  })
})
