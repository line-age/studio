import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { withClaims, type Network } from "@/data/schema"
import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { PipelinesPanel } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { pickStatus, statusCount } from "@/test/status-filter"

import { useSettings } from "./settings"
import { StudioDataProvider } from "./studio-data"
import { useStudio } from "./studio-store"

async function renderPanels(data: Network = testNetwork()) {
  const network = Promise.resolve(data)
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
  it("lists the pipelines with their status in words", async () => {
    await renderPanels()
    // The screen opens on All: the pipelines, the proposed one, then what
    // is in no pipeline, by edition.
    const list = screen.getByRole("listbox", { name: "Network" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
      expect.stringContaining("1937 edition1"),
    ])
    expect(rows[0]).toHaveTextContent("In progress")
    // Progress says what it counts: sections done of the pipeline's sections.
    expect(rows[0]).toHaveTextContent("1/2")
    expect(within(rows[0]).getByTitle("1 of 2 sections done")).toBeVisible()
    // A pipeline only proposed comes last, under its own heading, with its
    // score; no source names it, so its name is Unknown.
    expect(list).toHaveTextContent("Proposed pipelines")
    expect(rows[2]).toHaveTextContent("Unknown name")
    // The bare score beside the "Proposed" badge; in words in its title.
    expect(rows[2]).toHaveTextContent("0.70")
    expect(within(rows[2]).getByTitle("Score 0.70")).toBeVisible()
    expect(rows[2]).toHaveTextContent("Proposed")
    // A section only proposed for a pipeline is still in none.
    expect(list).toHaveTextContent("Not in a pipeline1")
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
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line"),
      // Owner is the pipeline's: the row says so and holds no value.
      "OwnerOn the pipeline",
      expect.stringContaining("Build dateUnknown"),
      expect.stringContaining("1 proposal"),
    ])
    expect(rows[0]).toHaveTextContent(/^Pipeline/)
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

  it("brings a section picked elsewhere to the top of the tree, open", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const calls: { id: string | null; block?: string }[] = []
    const spy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(function (this: Element, arg) {
        calls.push({
          id: this.getAttribute("data-section"),
          block: typeof arg === "object" ? arg.block : undefined,
        })
      })
    try {
      act(() => useStudio.getState().selectSection("s-3"))
      const section = screen.getByRole("treeitem", { name: /Dale to Elm/ })
      expect(section).toHaveAttribute("aria-expanded", "true")
      expect(calls.at(-1)).toEqual({ id: "s-3", block: "start" })

      // Picked in the tree itself: only into view, no jump.
      calls.length = 0
      await user.click(screen.getByRole("option", { name: /North line/ }))
      await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
      expect(calls.filter((c) => c.id !== null).at(-1)?.block).toBe("nearest")

      // Picked again from elsewhere after the tree moved: to the top again.
      calls.length = 0
      act(() => useStudio.getState().selectSection("s-3"))
      act(() => useStudio.getState().selectSection("s-3"))
      expect(calls.filter((c) => c.id === "s-3")).toHaveLength(2)

      // A lasso that catches one section opens it, as a click does.
      act(() => useStudio.getState().select(["s-1"]))
      expect(useStudio.getState().expandedSectionIds.has("s-1")).toBe(true)
      expect(calls.at(-1)).toEqual({ id: "s-1", block: "start" })
    } finally {
      spy.mockRestore()
    }
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
    const list = screen.getByRole("listbox", { name: "Network" })

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
      "s-5",
    ])
    expect(
      screen.getByRole("heading", { name: "2 pipelines" })
    ).toBeInTheDocument()
    expect(screen.getByText("4 sections in 2 pipelines")).toBeInTheDocument()

    // Unticking one section leaves its pipeline partly selected.
    const tree = screen.getByRole("tree")
    await user.click(within(tree).getAllByRole("checkbox")[0])
    expect(
      within(list).getByRole("checkbox", { name: "Select North line" })
    ).toHaveAttribute("aria-checked", "mixed")

    // A plain click on a row replaces the selection with that pipeline.
    await user.click(within(list).getByRole("option", { name: /South line/ }))
    expect([...useStudio.getState().selection]).toEqual(["s-3", "s-5"])
  })

  it("selects a run of rows with Shift, and all or none with the header box", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Network" })
    const rows = within(list).getAllByRole("option")

    await user.click(rows[0])
    await user.keyboard("{Shift>}")
    await user.click(rows[2])
    await user.keyboard("{/Shift}")
    expect(useStudio.getState().selection.size).toBe(5)

    const all = screen.getByRole("checkbox", {
      name: "Select everything shown",
    })
    expect(all).toBeChecked()
    await user.click(all)
    expect(useStudio.getState().selection.size).toBe(0)
    await user.click(all)
    expect(useStudio.getState().selection.size).toBe(5)
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
    expect([...useStudio.getState().selection]).toEqual(["s-3", "s-5"])
  })

  it("searches every pipeline and opens the first hit with Enter", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const input = screen.getByRole("combobox", { name: "Search name or code" })

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
    const input = screen.getByRole("combobox", { name: "Search name or code" })

    await user.type(input, "zzz")
    expect(screen.getByRole("status")).toHaveTextContent("Nothing matches")
    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
  })

  it("has one switch, and the title, column, rows and count follow it", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const tabs = within(screen.getByRole("tablist", { name: "Show" }))
    expect(tabs.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All",
      "Pipelines",
      "Unplaced",
    ])
    expect(tabs.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("heading", { name: "Network" })).toBeVisible()
    expect(screen.getByText("5 sections")).toBeVisible()
    // No Group by, no edition to choose.
    expect(screen.queryByRole("combobox", { name: "Group by" })).toBeNull()
    expect(screen.queryByRole("combobox", { name: /[Ee]dition/ })).toBeNull()

    await user.click(tabs.getByRole("tab", { name: "Pipelines" }))
    expect(useStudio.getState().scope).toBe("pipelines")
    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeVisible()
    // What is counted is said: the pipelines, and the sections in them.
    expect(screen.getByText("2 pipelines · 4 sections")).toBeVisible()
    const pipelines = screen.getByRole("listbox", { name: "Pipelines" })
    expect(
      within(pipelines)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
    ])
    expect(pipelines).not.toHaveTextContent("Not in a pipeline")

    await user.click(tabs.getByRole("tab", { name: "Unplaced" }))
    expect(screen.getByRole("heading", { name: "Unplaced" })).toBeVisible()
    expect(screen.getByText("1 section")).toBeVisible()
    const unplaced = screen.getByRole("listbox", { name: "Unplaced" })
    expect(
      within(unplaced)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([expect.stringContaining("1937 edition1")])
    // Editions are not under a heading of their own here.
    expect(unplaced).not.toHaveTextContent("Not in a pipeline")
  })

  it("keeps the selection through the switch, hidden sections among it", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const tabs = within(screen.getByRole("tablist", { name: "Show" }))
    const list = screen.getByRole("listbox", { name: "Network" })
    await user.click(
      within(list).getByRole("checkbox", { name: "Select North line" })
    )
    await user.click(
      within(list).getByRole("checkbox", { name: /1937 edition/ })
    )
    const picked = ["s-1", "s-2", "s-4"]
    expect([...useStudio.getState().selection].sort()).toEqual(picked)
    for (const tab of ["Unplaced", "Pipelines", "All"]) {
      await user.click(tabs.getByRole("tab", { name: tab }))
      expect([...useStudio.getState().selection].sort()).toEqual(picked)
      // The right panel still counts every one of them.
      expect(screen.getByText(/^3 sections/)).toBeVisible()
    }
  })

  it("lets the header box speak for the rows shown, never for hidden ones", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const all = () =>
      screen.getByRole("checkbox", { name: "Select everything shown" })
    // North line is selected, then hidden by the switch.
    await user.click(
      screen.getByRole("checkbox", { name: "Select North line" })
    )
    await user.click(screen.getByRole("tab", { name: "Unplaced" }))
    // Nothing shown is selected: the box is empty, not half ticked.
    expect(all()).toHaveAttribute("aria-checked", "false")
    // Ticking it adds what is shown and keeps the hidden pipeline.
    await user.click(all())
    expect([...useStudio.getState().selection].sort()).toEqual([
      "s-1",
      "s-2",
      "s-4",
    ])
    expect(all()).toHaveAttribute("aria-checked", "true")
    // Clearing it takes off only what is shown.
    await user.click(all())
    expect([...useStudio.getState().selection].sort()).toEqual(["s-1", "s-2"])
  })

  it("says a widened search stays inside what the switch shows", async () => {
    const user = userEvent.setup()
    act(() => {
      useStudio.getState().setScope("pipelines")
      // Only North line has a section with this diameter.
      useStudio.getState().setDiameters(["12 in"])
    })
    await renderPanels()
    await user.type(
      screen.getByRole("combobox", { name: "Search name or code" }),
      "south"
    )
    const widen = await screen.findByRole("button", {
      name: "Search every pipeline",
    })
    await user.click(widen)
    expect(screen.getByText("Searching every pipeline.")).toBeVisible()
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Every pipeline")
    expect(screen.queryByText(/whole network/i)).toBeNull()
  })

  it("says what a pipeline is when the data has none", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    await renderPanels({
      ...network,
      pipelines: [],
      sections: network.sections.map((s) => ({
        ...s,
        pipelineId: null,
        proposedMemberships: [],
      })),
    })
    await user.click(screen.getByRole("tab", { name: "Pipelines" }))
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    expect(within(list).queryAllByRole("option")).toHaveLength(0)
    expect(list).toHaveTextContent("No pipelines yet.")
    expect(list).toHaveTextContent("Make pipeline")
    expect(screen.getByText("0 pipelines · 0 sections")).toBeVisible()
  })

  it("counts and selects, on an edition's row, only what the filters leave", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    act(() => {
      useStudio.getState().setScope("unplaced")
      useStudio.getState().setDiameters(["6 in"])
    })
    // Every section in no pipeline: the 1937 edition first shows three.
    await renderPanels({
      ...network,
      sections: network.sections.map((s) => ({
        ...s,
        pipelineId: null,
        proposedMemberships: [],
      })),
    })
    const list = screen.getByRole("listbox", { name: "Unplaced" })
    // Only s-3 has that diameter: the 1937 row is one section, not three.
    const row = within(list).getByRole("option", { name: /1937 edition/ })
    expect(row).toHaveTextContent("1937 edition1")
    await user.click(row)
    expect([...useStudio.getState().selection]).toEqual(["s-3"])
    // All that shows is selected: the row is ticked, and the right lists one.
    expect(within(row).getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByText("1 of 1 selected")).toBeVisible()
    expect(
      screen.queryByRole("treeitem", { name: /Unnamed section/ })
    ).toBeNull()
  })

  it("puts what is in no pipeline last, under its heading, by edition", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Network" })
    expect(list).toHaveTextContent("Not in a pipeline1")
    const row = within(list).getByRole("option", { name: /1937 edition/ })
    await user.click(row)
    expect([...useStudio.getState().selection]).toEqual(["s-4"])
    // A group is not a pipeline: the link does not name one.
    expect(useStudio.getState().selectedPipelineId).toBeNull()
  })

  it("lists a first-seen group's sections on the right, not in the list", async () => {
    const user = userEvent.setup()
    act(() => useStudio.getState().setScope("unplaced"))
    const network = testNetwork()
    // Nothing confirmed part of a pipeline: the 1937 edition first shows three.
    await renderPanels({
      ...network,
      sections: network.sections.map((s) => ({ ...s, pipelineId: null })),
    })
    const list = screen.getByRole("listbox", { name: "Unplaced" })
    // The list has one row per group and nothing to open under it.
    expect(
      within(list).queryByRole("button", { name: /^List the sections/ })
    ).toBeNull()
    await user.click(within(list).getByRole("option", { name: /1937 edition/ }))
    expect(within(list).queryByText("Unnamed section")).toBeNull()
    const row = screen.getByRole("treeitem", { name: /Unnamed section/ })
    await user.click(row)
    // Reading one section keeps the group selected.
    expect([...useStudio.getState().selection]).toEqual(["s-2", "s-3", "s-4"])
    // The one section opens on the right, to its claims.
    expect(useStudio.getState().selectedSectionId).toBe("s-4")
    const claims = screen.getByRole("group", { name: /^Claims of / })
    // In no pipeline, only proposed for one: no Owner row at all.
    expect(within(claims).getByText("Not yet P-003's")).toBeVisible()
    expect(within(claims).queryByText("Owner")).toBeNull()
    expect(within(claims).getAllByText("Unknown").length).toBeGreaterThan(0)
  })

  it("counts sections beside each filter option, as everywhere else", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    // Diameter is Unknown on three sections, one in each row.
    const owner = within(screen.getByRole("group", { name: "Unknown in" }))
      .getByText("Diameter")
      .closest("label")
    expect(owner).toHaveTextContent("Diameter3")
    await user.click(within(owner!).getByRole("checkbox"))
    expect(
      screen.getByRole("button", { name: "Show 3 sections" })
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
      screen.getByRole("button", { name: /^Filters, \d+ (is|are) on$/ })
    ).toHaveAttribute("aria-pressed", "true")
  })

  const filterGroups = () =>
    screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id!)?.textContent)

  it("shows a filter only while it has something to tell apart", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    // The invented sample is in no US state and has no proposed end: those
    // filters could narrow nothing and are left out. The old Pipeline filter
    // is gone: the switch does that.
    expect(filterGroups()).toEqual([
      "Status",
      "First shown by",
      "Length",
      "Company",
      "Diameter",
      "Build date",
      "Added to Lineage",
      "Unknown in",
    ])
    // Status always shows; its two boxes only while they can narrow.
    const status = screen.getByRole("group", { name: "Sections by status" })
    expect(within(status).getByText("Needs your decision")).toBeVisible()
    expect(within(status).getByText("Changed since review")).toBeVisible()
  })

  it("leaves out a filter every section answers the same way, until it is on", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    // No section has a cited diameter: Unknown on all of them.
    const bare = {
      ...network,
      sections: network.sections.map((s) =>
        withClaims(
          { ...s, changedSinceReview: false },
          s.claims!.map((c) =>
            c.attribute === "Diameter"
              ? { ...c, value: null, citations: [], proposals: [] }
              : c
          )
        )
      ),
    }
    await renderPanels(bare)
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    expect(filterGroups()).not.toContain("Diameter")
    const status = screen.getByRole("group", { name: "Sections by status" })
    expect(within(status).queryByText("Changed since review")).toBeNull()
    // A filter that is on always shows, so it can be taken off.
    act(() => useStudio.getState().setDiameters(["6 in"]))
    expect(filterGroups()).toContain("Diameter")
  })

  it("offers the filters about a section on All and Unplaced, not on Pipelines", async () => {
    const user = userEvent.setup()
    act(() => useStudio.getState().setFirstSeenEditions(["ed-1931"]))
    await renderPanels()
    // In force on All: a chip, and the two sections the 1931 map first shows.
    const chips = () =>
      screen.queryByRole("group", { name: "Filters in force" })
    expect(chips()).toHaveTextContent("First shown by the 1931 edition")
    expect(screen.getByText("2 sections")).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Pipelines" }))
    // Paused: no chip, every pipeline listed, the filter button not lit.
    expect(chips()).toBeNull()
    expect(screen.getByText("2 pipelines · 4 sections")).toBeVisible()
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await user.click(screen.getByRole("button", { name: "Filters" }))
    expect(filterGroups()).not.toContain("First shown by")
    expect(filterGroups()).not.toContain("Length")
    expect(filterGroups()).toContain("Company")
    await user.click(screen.getByRole("button", { name: "Back to the list" }))

    // Kept, and in force again on the way back.
    expect(useStudio.getState().firstSeenEditions).toEqual(["ed-1931"])
    await user.click(screen.getByRole("tab", { name: "All" }))
    expect(chips()).toHaveTextContent("First shown by the 1931 edition")
  })

  it("finds an edition by typing, ticks several, each with its count", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    const box = screen.getByRole("combobox", { name: "Search editions" })
    expect(box).toHaveAttribute("placeholder", "Type to find an edition")
    await user.click(box)
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual([
      "1931 edition2",
      "1937 edition3",
    ])
    await user.type(box, "1937")
    await user.click(
      await screen.findByRole("option", { name: /1937 edition/ })
    )
    expect(useStudio.getState().firstSeenEditions).toEqual(["ed-1937"])
    expect(
      screen.getByRole("button", { name: "Show 3 sections" })
    ).toBeVisible()
    await user.clear(box)
    await user.type(box, "1931")
    await user.click(
      await screen.findByRole("option", { name: /1931 edition/ })
    )
    expect(useStudio.getState().firstSeenEditions).toEqual([
      "ed-1937",
      "ed-1931",
    ])
    expect(
      screen.getByRole("button", { name: "Show 5 sections" })
    ).toBeVisible()
  })

  it("narrows to a tracer's sections, named on screen and kept by id", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    const ann = { id: "agent-ann", name: "Ann Example" }
    const bob = { id: "agent-bob", name: "Bob Example" }
    await renderPanels({
      ...network,
      sections: network.sections.map((s, i) => ({
        ...s,
        tracedBy: i < 2 ? ann : bob,
      })),
    })
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    const box = screen.getByRole("combobox", { name: "Search tracers" })
    expect(box).toHaveAttribute("placeholder", "Type to find a tracer")
    await user.type(box, "Ann")
    const option = await screen.findByRole("option", { name: /Ann Example/ })
    expect(option).toHaveTextContent("Ann Example2")
    await user.click(option)
    // The id is what is kept, and what a link would carry.
    expect(useStudio.getState().tracers).toEqual(["agent-ann"])
    expect(
      screen.getByRole("button", { name: "Show 2 sections" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Back to the list" }))
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Traced by Ann Example")
    // Paused on Pipelines, like the other filters about a section.
    await user.click(screen.getByRole("tab", { name: "Pipelines" }))
    expect(screen.queryByRole("group", { name: "Filters in force" })).toBeNull()
  })

  it("leaves Traced by out when the data names no tracer", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    expect(filterGroups()).not.toContain("Traced by")
  })

  it("narrows by length and by a proposed end, each with a chip", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    await renderPanels({
      ...network,
      sections: network.sections.map((s) =>
        s.id === "s-4"
          ? {
              ...s,
              proposedEnds: [
                {
                  id: "pe-cut",
                  kind: "cut" as const,
                  otherSectionId: "gone-9",
                  score: 0.6,
                  citations: [],
                },
              ],
            }
          : s
      ),
    })
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    const ends = screen.getByRole("group", { name: "Proposed end" })
    expect(
      within(ends).getByText("The whole section").closest("label")
    ).toHaveTextContent("The whole section0")
    const part = within(ends).getByText("Part of it").closest("label")!
    expect(part).toHaveTextContent("Part of it1")
    await user.click(within(part).getByRole("checkbox"))
    expect(useStudio.getState().proposedEnd).toEqual(["cut"])
    expect(screen.getByRole("button", { name: "Show 1 section" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Clear Proposed end" }))

    await user.type(
      screen.getByRole("spinbutton", { name: "Length from, km" }),
      "100000"
    )
    expect(useStudio.getState().lengthFrom).toBe(100000)
    expect(
      screen.getByRole("button", { name: "Show 0 sections" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Back to the list" }))
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("100,000 km or longer")
  })

  it("counts the sections by status, and one click narrows the list", async () => {
    const user = userEvent.setup()
    act(() => useSettings.getState().toggleRequired("Build date"))
    await renderPanels()
    expect(await statusCount("All")).toBe(5)
    expect(await statusCount("Done")).toBe(2)
    expect(await statusCount("Not started")).toBe(3)
    // A diameter proposed on one section, a pipeline proposed for another.
    expect(await statusCount("Needs your decision")).toBe(2)
    // No status badge in the list while no status is chosen.
    expect(screen.queryByRole("group", { name: "Filters in force" })).toBeNull()

    await pickStatus("Not started")
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Not started")
    const list = screen.getByRole("listbox", { name: "Network" })
    // North and South line stay: one of each one's sections is not started.
    expect(
      within(list)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
      // s-4, proposed for P-003, is also in no pipeline yet.
      expect.stringContaining("1937 edition1"),
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

    // Its badge takes the filter off.
    await user.click(
      screen.getByRole("button", { name: "Remove the filter: Not started" })
    )
    expect(useStudio.getState().status).toBe("all")
  })

  it("opens the filters in place of the list and keeps them on the way back", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    expect(screen.queryByRole("listbox", { name: "Pipelines" })).toBeNull()

    await user.click(screen.getByRole("checkbox", { name: /Diameter/ }))
    // The count is live: three sections have no cited diameter.
    const show = screen.getByRole("button", { name: "Show 3 sections" })
    await user.click(show)

    expect(screen.getByRole("listbox", { name: "Network" })).toBeVisible()
    expect(useStudio.getState().unknownIn).toEqual(["Diameter"])
    expect(
      screen.getByRole("button", { name: /^Filters, \d+ (is|are) on$/ })
    ).toHaveAttribute("aria-pressed", "true")

    // The filter shows as a chip under the search, and comes off there.
    const chips = screen.getByRole("group", { name: "Filters in force" })
    expect(chips).toHaveTextContent("Unknown diameter")
    await user.click(
      within(chips).getByRole("button", { name: /Remove the filter/ })
    )
    expect(useStudio.getState().unknownIn).toEqual([])
  })

  it("clears every filter, the status among them", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => {
      useStudio.getState().setStatus("not-started")
      useStudio.getState().toggleUnknownIn("Owner")
    })
    await user.click(
      screen.getByRole("button", { name: /^Filters, \d+ (is|are) on$/ })
    )
    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(useStudio.getState().unknownIn).toEqual([])
    expect(useStudio.getState().status).toBe("all")
    await user.click(screen.getByRole("button", { name: "Back to the list" }))
    expect(screen.getByRole("listbox", { name: "Network" })).toBeVisible()
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
    await user.click(
      within(claims)
        .getAllByRole("treeitem")
        .find((row) => row.textContent?.startsWith("Diameter"))!
    )

    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
    expect(useStudio.getState().selectedAttribute).toBe("Diameter")
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

    act(() => useSettings.setState({ requiredAttributes: ["Diameter"] }))
    expect(row()).toHaveTextContent("0/1 cited")
  })

  it("speaks in the header for what is selected, not the pipeline around it", async () => {
    await renderPanels()
    act(() => useStudio.getState().select(["s-1", "s-2"]))
    expect(screen.getByText("1 of 2 sections done")).toBeInTheDocument()

    act(() => useStudio.getState().select(["s-2"]))
    expect(screen.getByText("0 of 1 section done")).toBeInTheDocument()
  })

  it("says selected of all in each group of a selection across pipelines", async () => {
    await renderPanels()
    act(() => useStudio.getState().select(["s-1", "s-3"]))
    expect(screen.getAllByText(/^1 of \d selected$/).length).toBe(2)
  })
})
