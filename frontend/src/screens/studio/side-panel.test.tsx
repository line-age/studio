import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { usePanelWidth } from "./panel-width-context"
import { SidePanel } from "./side-panel"

function Inside() {
  const panel = usePanelWidth()!
  return (
    <button type="button" onClick={panel.toggleWide}>
      {panel.wide ? "Show as list" : "Show as table"}
    </button>
  )
}

const panel = (storageKey = "test.width") => (
  <SidePanel
    side="left"
    open
    label="List"
    storageKey={storageKey}
    widthToken="--layout-panel-left"
    maxWidth={900}
    wideWidth={760}
  >
    <Inside />
  </SidePanel>
)

const width = () =>
  Number(screen.getByRole("separator").getAttribute("aria-valuenow"))

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.setProperty("--layout-panel-left", "300px")
})

describe("SidePanel", () => {
  it("widens into a table and back, returning to the last wide width", async () => {
    const user = userEvent.setup()
    render(panel())
    expect(width()).toBe(300)

    await user.click(screen.getByRole("button", { name: "Show as table" }))
    expect(width()).toBe(760)

    // Made narrower by hand: that is the width "table" now means.
    screen.getByRole("separator").focus()
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}")
    expect(width()).toBe(696)

    await user.click(screen.getByRole("button", { name: "Show as list" }))
    expect(width()).toBe(300)
    await user.click(screen.getByRole("button", { name: "Show as table" }))
    expect(width()).toBe(696)

    // A double click on the edge does the same.
    fireEvent.doubleClick(screen.getByRole("separator"))
    expect(width()).toBe(300)
  })

  it("keeps a width per storage key, and never goes past its maximum", () => {
    localStorage.setItem("test.width", "5000")
    const { rerender } = render(panel())
    expect(width()).toBe(900)
    // Another thing in the same panel has its own width.
    rerender(panel("test.other"))
    expect(width()).toBe(300)
    rerender(panel())
    expect(width()).toBe(900)
  })
})
