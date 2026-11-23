import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "../left-panel-context"
import { PropertiesPanel } from "../panels/properties-panel"
import { StudioDataProvider } from "../studio-data"
import { useStudio } from "../studio-store"

/** The right panel with North line's two sections listed. */
async function renderTree() {
  const network = Promise.resolve(testNetwork())
  useStudio.getState().select(["s-1", "s-2"])
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <LeftPanelContext
          value={{
            panel: "pipelines",
            open: true,
            openPanel: () => {},
            togglePanel: () => {},
            toggleOpen: () => {},
          }}
        >
          <StudioDataProvider network={network}>
            <PropertiesPanel />
          </StudioDataProvider>
        </LeftPanelContext>
      </Suspense>
    )
  })
  return userEvent.setup()
}

const row = (name: RegExp) => screen.getByRole("treeitem", { name })

beforeEach(() => {
  localStorage.clear()
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("Pointing at a section's row", () => {
  it("shows a card with the section's basic facts", async () => {
    const user = await renderTree()
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    await user.hover(row(/Alder to Birch/))

    const card = await screen.findByRole("tooltip")
    expect(card).toHaveTextContent("Alder to Birch")
    expect(card).toHaveTextContent("S-0001")
    expect(card).toHaveTextContent("North line · P-001")
    const fact = (label: string) =>
      within(card).getByText(label).nextElementSibling
    expect(fact("Owner")).toHaveTextContent("Alder Gas Co., Yew Fuel Co.")
    expect(fact("Diameter")).toHaveTextContent("12 in")
    expect(fact("Length")).toHaveTextContent("110 km")
    expect(card).not.toHaveTextContent("waiting")
  })

  it("says Unknown in words and that a proposal waits, never the proposed value", async () => {
    const user = await renderTree()
    await user.hover(row(/Birch to Cedar/))

    const card = await screen.findByRole("tooltip")
    expect(
      within(card).getByText("Diameter").nextElementSibling
    ).toHaveTextContent("Unknown")
    expect(card).toHaveTextContent("1 proposal waiting")
    expect(card).not.toHaveTextContent("8 in")
  })

  it("changes nothing: the selection and the section being read stay", async () => {
    const user = await renderTree()
    const before = useStudio.getState()
    await user.hover(row(/Birch to Cedar/))
    await screen.findByRole("tooltip")

    const after = useStudio.getState()
    expect([...after.selection]).toEqual([...before.selection])
    expect(after.selectedSectionId).toBe(before.selectedSectionId)
    expect(after.expandedSectionIds).toBe(before.expandedSectionIds)
  })

  it("tells the map which section's row the pointer is on, and stops when it leaves", async () => {
    const user = await renderTree()
    await user.hover(row(/Birch to Cedar/))
    expect(useStudio.getState().pointedSectionId).toBe("s-2")

    await user.hover(screen.getByText("Sections"))
    expect(useStudio.getState().pointedSectionId).toBeNull()
  })

  it("takes the card away when the pointer leaves the row", async () => {
    const user = await renderTree()
    await user.hover(row(/Alder to Birch/))
    await screen.findByRole("tooltip")

    await user.unhover(row(/Alder to Birch/))
    await user.hover(screen.getByText("Sections"))

    await expect
      .poll(() => screen.queryByRole("tooltip"))
      .not.toBeInTheDocument()
  })

  it("shows the other section's card when the pointer moves to its row", async () => {
    const user = await renderTree()
    await user.hover(row(/Alder to Birch/))
    await screen.findByRole("tooltip")

    await user.hover(row(/Birch to Cedar/))

    await expect
      .poll(() => screen.getByRole("tooltip").textContent)
      .toContain("Birch to Cedar")
  })

  it("shows no card for a touch", async () => {
    const user = await renderTree()
    await user.pointer({
      keys: "[TouchA>]",
      target: row(/Alder to Birch/),
    })
    await new Promise((done) => setTimeout(done, 300))
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("takes the card away when the row's right-click menu opens", async () => {
    const user = await renderTree()
    await user.hover(row(/Alder to Birch/))
    await screen.findByRole("tooltip")

    await user.pointer({ keys: "[MouseRight]", target: row(/Alder to Birch/) })

    await screen.findByRole("menu")
    await expect
      .poll(() => screen.queryByRole("tooltip"))
      .not.toBeInTheDocument()
  })
})
