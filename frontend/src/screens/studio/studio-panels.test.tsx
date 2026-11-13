import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import type { Network } from "@/data/schema"
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
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    const rows = within(list).getAllByRole("option")
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
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
    // Every section here is in a pipeline or proposed for one: no last row.
    expect(list).not.toHaveTextContent("Not in a pipeline")
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
    const list = screen.getByRole("listbox", { name: "Pipelines" })
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

  it("has one Group by, and the title, column and rows follow it", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const groupBy = screen.getByRole("combobox", { name: "Group by" })
    expect(groupBy).toHaveTextContent("Group byPipeline")
    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeVisible()
    // No edition to choose, and no counts by status above the list.
    expect(screen.queryByRole("combobox", { name: /[Ee]dition/ })).toBeNull()

    await user.click(groupBy)
    const choices = await screen.findAllByRole("option", {
      name: /^(Edition|Pipeline)$/,
    })
    expect(choices.map((c) => c.textContent)).toEqual(["Edition", "Pipeline"])
    await user.click(choices[0])
    expect(useStudio.getState().list).toBe("sections")
    expect(screen.getByRole("heading", { name: "Editions" })).toBeVisible()
    const list = screen.getByRole("listbox", { name: "Editions" })
    // Every section, the old route on the 1931 map among them.
    expect(
      within(list)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining("1931 edition2"),
      expect.stringContaining("1937 edition3"),
    ])
    // Editions are not under a heading of their own.
    expect(list).not.toHaveTextContent("first seen")
  })

  it("puts what is in no pipeline in one last row, under its heading", async () => {
    const user = userEvent.setup()
    const network = testNetwork()
    await renderPanels({
      ...network,
      sections: network.sections.map((s) =>
        s.id === "s-4" ? { ...s, proposedMemberships: [] } : s
      ),
    })
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    expect(list).toHaveTextContent("Not in a pipeline1")
    const row = within(list).getByRole("option", { name: /No pipeline/ })
    expect(row).toHaveTextContent("No pipeline1")
    await user.click(row)
    expect([...useStudio.getState().selection]).toEqual(["s-4"])
    // A group is not a pipeline: the link does not name one.
    expect(useStudio.getState().selectedPipelineId).toBeNull()
  })

  it("lists a first-seen group's sections on the right, not in the list", async () => {
    const user = userEvent.setup()
    act(() => useStudio.getState().setList("sections"))
    await renderPanels()
    const list = screen.getByRole("listbox", { name: "Editions" })
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

  it("shows every filter group, and says so when one has nothing to offer", async () => {
    const user = userEvent.setup()
    await renderPanels()
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    const groups = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id!)?.textContent)
    expect(groups).toEqual([
      "Status",
      "Pipeline",
      "First seen",
      "State",
      "Company",
      "Diameter",
      "Build date",
      "Added to Lineage",
      "Unknown in",
    ])
    // The invented sample is not in any US state.
    expect(
      screen.getByText("No section runs through a US state.")
    ).toBeVisible()
  })

  it("narrows to the sections proposed for a pipeline, with a chip", async () => {
    const user = userEvent.setup()
    act(() => useStudio.getState().setList("sections"))
    await renderPanels()
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    const pipeline = screen.getByRole("group", { name: "Pipeline" })
    const proposed = within(pipeline)
      .getByText("Proposed for one")
      .closest("label")!
    expect(proposed).toHaveTextContent("Proposed for one1")
    await user.click(within(proposed).getByRole("checkbox"))
    expect(screen.getByRole("button", { name: "Show 1 section" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Back to the list" }))
    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Proposed for one")
    expect(useStudio.getState().memberships).toEqual(["proposed"])
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
    const list = screen.getByRole("listbox", { name: "Pipelines" })
    // North and South line stay: one of each one's sections is not started.
    expect(
      within(list)
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
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

    expect(screen.getByRole("listbox", { name: "Pipelines" })).toBeVisible()
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
    expect(screen.getByRole("listbox", { name: "Pipelines" })).toBeVisible()
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
