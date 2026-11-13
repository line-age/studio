import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { EditionsPanel } from "./panels/editions-panel"
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
            toggleOpen: () => {},
          }}
        >
          <StudioDataProvider network={network}>
            <div>
              <PipelinesPanel />
            </div>
            <div>
              <PropertiesPanel />
            </div>
            <div>
              <EditionsPanel />
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
    expect(rows[0]).toHaveTextContent("2 of 4 claims")
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

  it("opens a section to its claims and marks Unknown in words", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))

    const section = screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    expect(section).toHaveAttribute("aria-expanded", "true")
    expect(section).toHaveAttribute("aria-selected", "true")

    const claims = screen.getByRole("group", {
      name: "Claims of Birch to Cedar",
    })
    const rows = within(claims).getAllByRole("treeitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Owner")
    expect(rows[0]).toHaveTextContent("Unknown")
    expect(rows[1]).toHaveTextContent("1 proposal")
  })

  it("follows a selection made elsewhere, as the map does", async () => {
    await renderPanels()
    act(() => useStudio.getState().selectSection("s-3"))

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
    act(() => useStudio.getState().select(["s-1", "s-2"]))

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
    // Nothing ticked is nothing selected: the panel has no more to show.
    await user.click(all)
    expect(useStudio.getState().selection.size).toBe(0)
    expect(
      screen.getByRole("heading", { name: "Nothing selected" })
    ).toBeInTheDocument()
  })

  it("adds pipelines by their boxes and lists them grouped on the right", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Pipelines" })

    await user.click(
      within(list).getByRole("checkbox", { name: "Select North line" })
    )
    await user.click(
      within(list).getByRole("checkbox", { name: "Select South line" })
    )
    expect([...useStudio.getState().selection].sort()).toEqual([
      "s-1",
      "s-2",
      "s-3",
    ])
    expect(
      screen.getByRole("heading", { name: "2 pipelines" })
    ).toBeInTheDocument()
    expect(screen.getByText("3 sections in 2 pipelines")).toBeInTheDocument()

    // Unticking one section leaves its pipeline partly selected.
    const tree = screen.getByRole("tree")
    await user.click(within(tree).getAllByRole("checkbox")[0])
    expect(
      within(list).getByRole("checkbox", { name: "Select North line" })
    ).toHaveAttribute("aria-checked", "mixed")

    // A plain click on a row replaces the selection with that pipeline.
    await user.click(within(list).getByRole("option", { name: /South line/ }))
    expect([...useStudio.getState().selection]).toEqual(["s-3"])
  })

  it("selects a run of rows with Shift, and all or none with the header box", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    const rows = within(list).getAllByRole("option")

    await user.click(rows[0])
    await user.keyboard("{Shift>}")
    await user.click(rows[2])
    await user.keyboard("{/Shift}")
    expect(useStudio.getState().selection.size).toBe(4)

    const all = screen.getByRole("checkbox", {
      name: "Select all pipelines shown",
    })
    expect(all).toBeChecked()
    await user.click(all)
    expect(useStudio.getState().selection.size).toBe(0)
    await user.click(all)
    expect(useStudio.getState().selection.size).toBe(4)
  })

  it("hands sections to the Agent as one attachment per pipeline", () => {
    act(() =>
      useStudio.getState().askAgent([
        { pipelineId: "p-1", sectionIds: ["s-1"] },
        { pipelineId: "p-2", sectionIds: "all" },
      ])
    )
    expect(useStudio.getState().agentAsked).toBe(1)
    expect(useStudio.getState().agentAttachments).toEqual([
      { pipelineId: "p-1", sectionIds: ["s-1"] },
      { pipelineId: "p-2", sectionIds: "all" },
    ])

    // Attaching more of a pipeline widens its attachment; it is not doubled.
    act(() =>
      useStudio
        .getState()
        .attachToAgent([{ pipelineId: "p-1", sectionIds: ["s-2"] }])
    )
    expect(useStudio.getState().agentAttachments[0]).toEqual({
      pipelineId: "p-1",
      sectionIds: ["s-1", "s-2"],
    })
  })

  it("steps a selection back: some sections, whole pipelines, nothing", () => {
    const whole = ["s-1", "s-2", "s-3"]
    act(() => useStudio.getState().select(["s-1", "s-3"]))
    act(() => useStudio.getState().stepBack(whole))
    expect([...useStudio.getState().selection]).toEqual(whole)
    act(() => useStudio.getState().stepBack(whole))
    expect(useStudio.getState().selection.size).toBe(0)
  })

  it("moves through the list with the arrow keys and selects with Enter", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const rows = screen.getAllByRole("option")
    rows[0].focus()

    await user.keyboard("{ArrowDown}")
    expect(rows[1]).toHaveFocus()
    await user.keyboard("{Enter}")
    expect([...useStudio.getState().selection]).toEqual(["s-3"])
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
      selection: new Set(["s-2"]),
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

  it("lists the editions with how many sections are in a pipeline", async () => {
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Editions" })
    const rows = within(list).getAllByRole("option")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("1931 edition")
    expect(rows[0]).toHaveTextContent("2 sections first seen")
    expect(rows[0]).toHaveTextContent("2 of 2 in a pipeline")
    expect(rows[1]).toHaveTextContent("2 of 3 in a pipeline")
    // The latest edition is the one in force when the screen opens.
    expect(rows[1]).toHaveAttribute("aria-selected", "true")
  })

  it("puts an edition in force when it is chosen", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const editions = screen.getByRole("listbox", { name: "Editions" })
    await user.click(within(editions).getAllByRole("option")[0])
    expect(useStudio.getState().editionId).toBe("ed-1931")
    // The 1931 map shows the old route and not the later sections.
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("1 section"),
      expect.stringContaining("1 section"),
    ])
  })

  it("opens an edition's own sections from its row", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(
      screen.getByRole("button", {
        name: "Open the sections of the 1937 edition",
      })
    )
    expect([...useStudio.getState().selection].sort()).toEqual([
      "s-2",
      "s-3",
      "s-4",
    ])
  })
})
