import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { PipelinesPanel } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { useSettings } from "./settings"
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
          </StudioDataProvider>
        </LeftPanelContext>
      </Suspense>
    )
  })
}

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("Studio panels", () => {
  it("lists the pipelines of the latest edition with their status in words", async () => {
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Sections" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("1937 edition"),
    ])
    expect(rows[0]).toHaveTextContent("In progress")
    // Progress says what it counts: sections done of the pipeline's sections.
    expect(rows[0]).toHaveTextContent("0/2 done")
    // Sections in no pipeline come last, under the edition that first
    // shows them, and can only get as far as sufficient.
    expect(list).toHaveTextContent("Not in a pipeline, by first seen")
    expect(rows[2]).toHaveTextContent("1937 edition1 sectionNot started")
    expect(rows[2]).toHaveTextContent("Not started")
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
    const list = screen.getByRole("listbox", { name: "Sections" })

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
    const list = screen.getByRole("listbox", { name: "Sections" })
    const rows = within(list).getAllByRole("option")

    await user.click(rows[0])
    await user.keyboard("{Shift>}")
    await user.click(rows[2])
    await user.keyboard("{/Shift}")
    expect(useStudio.getState().selection.size).toBe(4)

    const all = screen.getByRole("checkbox", {
      name: "Select everything shown",
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
    const input = screen.getByRole("combobox", { name: "Search sections" })

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
    const input = screen.getByRole("combobox", { name: "Search sections" })

    await user.type(input, "zzz")
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing in the 1937 edition matches"
    )
    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
  })

  it("shows the network as of the edition chosen", async () => {
    await renderPanels()
    expect(
      screen.getByRole("combobox", {
        name: "Edition the network is shown as of",
      })
    ).toHaveTextContent("As of the 1937 edition")
    act(() => useStudio.getState().setEdition("ed-1931"))
    // The 1931 map shows the old route and not the later sections.
    const list = screen.getByRole("listbox", { name: "Sections" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line0/1"),
      expect.stringContaining("South line0/1"),
    ])
  })

  it("lists the sections of a first-seen group once it is opened", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Sections" })
    expect(within(list).queryByText("Unnamed section")).toBeNull()
    await user.click(
      screen.getByRole("button", {
        name: "List the sections first seen in the 1937 edition",
      })
    )
    const row = within(list)
      .getByText("Unnamed section")
      .closest("[role=option]")
    expect(row).toHaveTextContent("0/3")
    expect(row).toHaveTextContent("Not started")
    await user.click(row!)
    expect([...useStudio.getState().selection]).toEqual(["s-4"])
    // The one section opens on the right, to its claims.
    expect(useStudio.getState().selectedSectionId).toBe("s-4")
    const claims = screen.getByRole("group", { name: /^Claims of / })
    expect(within(claims).getByText("Owner")).toBeVisible()
    expect(within(claims).getAllByText("Unknown").length).toBeGreaterThan(0)
  })

  it("counts sections beside each filter option, as everywhere else", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    // Owner is Unknown on two sections; they sit in two rows of three.
    const owner = within(screen.getByRole("group", { name: "Unknown in" }))
      .getByText("Owner")
      .closest("label")
    expect(owner).toHaveTextContent("Owner2")
    await user.click(within(owner!).getByRole("checkbox"))
    expect(
      screen.getByRole("button", { name: "Show 2 sections" })
    ).toBeVisible()
  })

  it("takes one filter off by its chip and leaves the others", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => {
      useStudio.getState().toggleUnknownIn("Owner")
      useStudio.getState().setCompanies(["Alder Gas Co."])
    })
    const chips = screen.getByRole("group", { name: "Filters in force" })
    const remove = within(chips).getAllByRole("button", {
      name: /Remove the filter/,
    })
    expect(remove).toHaveLength(2)
    await user.click(remove[0])
    const s = useStudio.getState()
    expect([s.unknownIn.length, s.companies.length].sort()).toEqual([0, 1])
    expect(
      within(chips).getAllByRole("button", { name: /Remove the filter/ })
    ).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "Filters, some are on" })
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("counts the sections by status, and one click narrows the list", async () => {
    const user = userEvent.setup()
    act(() => useSettings.getState().toggleRequired("Build date"))
    await renderPanels()
    const counts = screen.getByRole("group", { name: "Sections by status" })
    const count = (name: RegExp) => within(counts).getByRole("button", { name })
    expect(count(/^All/)).toHaveTextContent("All4")
    expect(count(/^Done/)).toHaveTextContent("Done2")
    expect(count(/^Not started/)).toHaveTextContent("Not started2")
    expect(count(/^Needs your decision/)).toHaveTextContent("1")

    await user.click(count(/^Not started/))
    expect(count(/^Not started/)).toHaveAttribute("aria-pressed", "true")
    const list = screen.getByRole("listbox", { name: "Sections" })
    // North line stays: one of its two sections is not started.
    expect(
      within(list)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("1937 edition"),
    ])

    // In the right panel the section that does not match is dimmed.
    await user.click(within(list).getByText("North line"))
    const tree = screen.getByRole("tree")
    const dimmed = within(tree)
      .getAllByRole("treeitem")
      .filter((row) => row.hasAttribute("data-dimmed"))
    expect(dimmed.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Alder to Birch"),
    ])

    // The same count again takes the filter off.
    await user.click(count(/^Not started/))
    expect(useStudio.getState().status).toBe("all")
  })

  it("opens the filters in place of the list and keeps them on the way back", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    expect(screen.queryByRole("listbox", { name: "Sections" })).toBeNull()

    await user.click(screen.getByRole("checkbox", { name: /Owner/ }))
    // The count is live: two sections of the edition have no cited owner.
    const show = screen.getByRole("button", { name: "Show 2 sections" })
    await user.click(show)

    expect(screen.getByRole("listbox", { name: "Sections" })).toBeVisible()
    expect(useStudio.getState().unknownIn).toEqual(["Owner"])
    expect(
      screen.getByRole("button", { name: "Filters, some are on" })
    ).toHaveAttribute("aria-pressed", "true")

    // The filter shows as a chip under the counts, and comes off there.
    const chips = screen.getByRole("group", { name: "Filters in force" })
    expect(chips).toHaveTextContent("Unknown owner")
    await user.click(
      within(chips).getByRole("button", { name: /Remove the filter/ })
    )
    expect(useStudio.getState().unknownIn).toEqual([])
  })

  it("clears the filters and leaves the status as chosen", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => {
      useStudio.getState().setStatus("not-started")
      useStudio.getState().toggleUnknownIn("Owner")
    })
    await user.click(
      screen.getByRole("button", { name: "Filters, some are on" })
    )
    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(useStudio.getState().unknownIn).toEqual([])
    expect(useStudio.getState().status).toBe("not-started")
    await user.click(screen.getByRole("button", { name: "Back to the list" }))
    expect(screen.getByRole("listbox", { name: "Sections" })).toBeVisible()
  })
})

describe("Reading is not selecting", () => {
  it("opens one section after another and keeps the whole pipeline selected", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))

    await user.click(screen.getByRole("treeitem", { name: /Alder to Birch/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))

    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
    expect(useStudio.getState().selectedSectionId).toBe("s-2")
    expect(
      screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    ).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument()
  })

  it("keeps the selection when a claim is opened", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    const claims = screen.getByRole("group", {
      name: "Claims of Birch to Cedar",
    })
    await user.click(within(claims).getAllByRole("treeitem")[0])

    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
    expect(useStudio.getState().selectedAttribute).toBe("Owner")
  })

  it("opens a section that is not ticked without ticking it", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => useStudio.getState().select(["s-1"]))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))

    expect(useStudio.getState().selection).toEqual(new Set(["s-1"]))
    expect(useStudio.getState().selectedSectionId).toBe("s-2")
    expect(
      screen.getByRole("group", { name: "Claims of Birch to Cedar" })
    ).toBeInTheDocument()
  })

  it("closes the section being read on a second click", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    const row = () => screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    await user.click(row())
    expect(row()).toHaveAttribute("aria-expanded", "true")
    await user.click(row())
    expect(row()).toHaveAttribute("aria-expanded", "false")
    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
  })

  it("changes the selection only through the boxes", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(
      screen.getByRole("checkbox", { name: "Select Alder to Birch" })
    )
    expect(useStudio.getState().selection).toEqual(new Set(["s-2"]))
  })
})

describe("Progress says what it counts", () => {
  it("counts a section's required claims cited, by the rule in Settings", async () => {
    await renderPanels()
    act(() => useStudio.getState().select(["s-1", "s-2"]))
    const row = () => screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    const required = useSettings.getState().requiredAttributes.length
    expect(row()).toHaveTextContent(new RegExp(`\\d/${required} cited`))
    // No second count of Unknown on the row: Unknown is a word on a claim.
    expect(row()).not.toHaveTextContent(/\d Unknown/)

    act(() => useSettings.setState({ requiredAttributes: ["Owner"] }))
    expect(row()).toHaveTextContent("0/1 cited")
  })

  it("speaks in the header for what is selected, not the pipeline around it", async () => {
    await renderPanels()
    act(() => useStudio.getState().select(["s-1", "s-2"]))
    expect(screen.getByText("0 of 2 sections done")).toBeInTheDocument()

    act(() => useStudio.getState().select(["s-1"]))
    expect(screen.getByText("0 of 1 section done")).toBeInTheDocument()
  })

  it("says selected of all in each group of a selection across pipelines", async () => {
    await renderPanels()
    act(() => useStudio.getState().select(["s-1", "s-3"]))
    expect(screen.getAllByText(/^1 of \d selected$/).length).toBe(2)
  })
})
