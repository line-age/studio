import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { PipelinesPanel } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { StudioDataProvider } from "./studio-data"
import { useStudio } from "./studio-store"

async function renderPanels() {
  const network = Promise.resolve(testNetwork())
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <LeftPanelContext
          value={{
            panel: "pipelines",
            open: true,
            openPanel: () => {},
            togglePanel: () => {},
          }}
        >
          <StudioDataProvider network={network}>
            <div>
              <PipelinesPanel />
            </div>
            <div>
              <PropertiesPanel />
            </div>
          </StudioDataProvider>
        </LeftPanelContext>
      </Suspense>
    )
  })
}

beforeEach(() => {
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("Studio panels", () => {
  it("lists the pipelines of the latest edition with their status in words", async () => {
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("Not in a pipeline"),
    ])
    expect(rows[0]).toHaveTextContent("2 Unknown")
    expect(rows[0]).toHaveTextContent("2 of 4 facts")
    expect(rows[1]).toHaveTextContent("All cited")
  })

  it("shows the sections of the selected pipeline and asks the map to show it", async () => {
    const user = userEvent.setup()
    await renderPanels()
    expect(screen.getByText("Nothing selected")).toBeInTheDocument()

    await user.click(screen.getByRole("option", { name: /North line/ }))

    expect(screen.getByRole("option", { name: /North line/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    const tree = screen.getByRole("tree", { name: "Sections of North line" })
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(2)
    expect(useStudio.getState().fit?.bounds).toEqual([0, 10, 2, 11])
  })

  it("opens a section to its facts and marks Unknown in words", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))

    const section = screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    expect(section).toHaveAttribute("aria-expanded", "true")
    expect(section).toHaveAttribute("aria-selected", "true")

    const facts = screen.getByRole("group", { name: "Facts of Birch to Cedar" })
    const rows = within(facts).getAllByRole("treeitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Owner")
    expect(rows[0]).toHaveTextContent("Unknown")
    expect(rows[1]).toHaveTextContent("1 proposal")
  })

  it("follows a selection made elsewhere, as the map does", async () => {
    await renderPanels()
    act(() => useStudio.getState().selectSection("p-2", "s-3"))

    expect(screen.getByRole("option", { name: /South line/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(
      screen.getByRole("treeitem", { name: /Dale to Elm/ })
    ).toHaveAttribute("aria-selected", "true")
  })

  it("ticks every section of a selected pipeline, and the header box selects all or none", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => useStudio.getState().selectPipeline("p-1"))

    const all = screen.getByRole("checkbox", { name: "Select all sections" })
    const tree = screen.getByRole("tree")
    const boxes = within(tree).getAllByRole("checkbox")
    expect(all).toBeChecked()
    boxes.forEach((box) => expect(box).toBeChecked())

    await user.click(boxes[0])
    expect(boxes[0]).not.toBeChecked()
    if (boxes.length > 1) expect(all).toHaveAttribute("aria-checked", "mixed")

    await user.click(all)
    expect(all).toBeChecked()
    await user.click(all)
    expect(all).not.toBeChecked()
    within(tree)
      .getAllByRole("checkbox")
      .forEach((box) => expect(box).not.toBeChecked())
  })

  it("moves through the list with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const rows = screen.getAllByRole("option")
    rows[0].focus()

    await user.keyboard("{ArrowDown}")
    expect(rows[1]).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(useStudio.getState().selectedPipelineId).toBe("p-2")
  })

  it("searches every pipeline and opens the first hit with Enter", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const input = screen.getByRole("combobox", { name: "Search pipelines" })

    await user.type(input, "cedar")
    const results = screen.getByRole("listbox", { name: "Search results" })
    // The pipeline that holds the match, then the matching section under it.
    const found = within(results).getAllByRole("option")
    expect(found).toHaveLength(2)
    expect(found[1]).toHaveTextContent("Birch to Cedar")

    await user.keyboard("{Enter}")
    expect(useStudio.getState()).toMatchObject({
      selectedPipelineId: "p-1",
      selectedSectionId: "s-2",
      query: "",
    })
  })

  it("says so when nothing matches, and Esc clears the search", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const input = screen.getByRole("combobox", { name: "Search pipelines" })

    await user.type(input, "zzz")
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing in the 1937 edition matches"
    )
    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
  })
})
