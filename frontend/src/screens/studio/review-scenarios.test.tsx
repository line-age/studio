import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { pickStatus, statusCount } from "@/test/status-filter"

import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * A reviewer's work, walked from start to end on the whole screen: each test
 * is one thing a person sits down to do. The map is not drawn here; what a
 * click on it does is checked by hand.
 *
 * The test network as of 1937: North line (Alder to Birch with diameter and
 * build date cited; Birch to Cedar with neither, and a diameter proposed),
 * whose owner changed; South line (Dale to Elm, both cited), owner Unknown;
 * and one section in no pipeline, proposed for a pipeline nobody has named.
 */

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(testNetwork()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))

async function open() {
  await act(async () => {
    render(<StudioScreen />)
  })
  return userEvent.setup()
}

const list = () =>
  screen.getByRole("listbox", { name: /^(Network|Pipelines|Unplaced)$/ })
const rows = () =>
  within(list())
    .getAllByRole("option")
    .map((row) => row.textContent ?? "")
const rowOf = (section: string, attribute: string) =>
  within(claimsOf(section))
    .getAllByRole("treeitem")
    .find((row) => row.textContent?.startsWith(attribute))!
const claimsOf = (section: string) =>
  screen.getByRole("group", { name: `Claims of ${section}` })

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("reviewing", () => {
  it("finds what is not started and sees which section it is", async () => {
    const user = await open()
    expect(await statusCount("All")).toBe(5)
    expect(await statusCount("Not started")).toBe(3)

    await pickStatus("Not started")
    // Each row holds one: South line's is its old route.
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
      // s-4 is in no pipeline yet, and proposed for P-003.
      expect.stringContaining("1937 edition"),
    ])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    // Both sections are listed; the one already begun is only dimmed.
    expect(
      screen.getByRole("treeitem", { name: /Alder to Birch/ })
    ).toHaveAttribute("data-dimmed")
    expect(
      screen.getByRole("treeitem", { name: /Birch to Cedar/ })
    ).not.toHaveAttribute("data-dimmed")
  })

  it("looks one section up by name and reads its claims", async () => {
    const user = await open()
    await user.type(
      screen.getByRole("combobox", { name: "Search name or code" }),
      "alder to{Enter}"
    )
    const claims = within(claimsOf("Alder to Birch")).getAllByRole("treeitem")
    expect(claims[0]).toHaveTextContent("PipelineNorth line")
    expect(claims[1]).toHaveTextContent("OwnerOn the pipeline")
    expect(claims[2]).toHaveTextContent("Diameter12 in")
    expect(claims[2]).toHaveTextContent("Cited by1source")
    // The link now points at this section.
    expect(window.location.search).toContain("sel=s-1")
  })

  it("opens the source behind a value, and puts it away", async () => {
    const user = await open()
    await user.type(
      screen.getByRole("combobox", { name: "Search name or code" }),
      "alder to{Enter}"
    )
    await user.click(rowOf("Alder to Birch", "Diameter"))
    // A click on the value opens where it comes from, and Done puts it away.
    expect(
      screen.getByRole("dialog", { name: "Diameter: 12 in" })
    ).toBeInTheDocument()
    const detail = screen.getByRole("region", {
      name: "Diameter of Alder to Birch",
    })
    const sources = within(detail).getByRole("list", { name: "Sources" })
    expect(sources).toHaveTextContent("1937 edition")
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    // The section stays open above.
    expect(claimsOf("Alder to Birch")).toBeVisible()
  })

  it("lists every section with no diameter and opens one", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.click(
      within(screen.getByRole("group", { name: "Unknown in" })).getByRole(
        "checkbox",
        { name: /Diameter/ }
      )
    )
    await user.click(screen.getByRole("button", { name: "Show 3 sections" }))

    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Unknown diameter")
    expect(await statusCount("All")).toBe(3)
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
      expect.stringContaining("P-003"),
      // s-4 is in no pipeline yet, and proposed for P-003.
      expect.stringContaining("1937 edition"),
    ])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    expect(rowOf("Birch to Cedar", "Diameter")).toHaveTextContent("Unknown")
  })

  it("reads who owned a pipeline, and when, from one of its sections", async () => {
    const user = await open()
    // A pipeline opens in the list to its own claims, each with its period.
    screen.getByRole("option", { name: /North line/ }).focus()
    await user.keyboard("{ArrowRight}")
    const own = screen.getByRole("group", { name: "Claims about North line" })
    expect(own).toHaveTextContent("Alder Gas Co., by 1931")
    expect(own).toHaveTextContent("Yew Fuel Co., from 1936")
    // No source names it or its operator: both Unknown, in words.
    expect(own).toHaveTextContent("NameUnknown")
    expect(own).toHaveTextContent("OperatorUnknown")

    // Closed again, then from a section, Owner leads back to the pipeline as
    // a whole, open in the list. A lone selected section opens by itself.
    await user.keyboard("{ArrowLeft}")
    expect(
      screen.queryByRole("group", { name: "Claims about North line" })
    ).toBeNull()
    act(() => useStudio.getState().select(["s-1"]))
    await user.click(rowOf("Alder to Birch", "Owner"))
    expect(useStudio.getState().selection).toEqual(new Set(["s-1", "s-2"]))
    expect(
      screen.getByRole("group", { name: "Claims about North line" })
    ).toBeVisible()
    expect(window.location.search).toContain("p=p-1")
  })

  it("finds a pipeline by its owner", async () => {
    const user = await open()
    await user.type(
      screen.getByRole("combobox", { name: "Search name or code" }),
      "yew fuel"
    )
    expect(
      within(screen.getByRole("listbox", { name: "Search results" }))
        .getAllByRole("option")
        .map((row) => row.textContent)
    ).toEqual([expect.stringContaining("North line")])
  })

  it("finds the proposal that waits for a decision", async () => {
    const user = await open()
    // A diameter proposed on one section, a pipeline on another.
    expect(await statusCount("Needs your decision")).toBe(2)
    await pickStatus("Needs your decision")
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("P-003"),
      expect.stringContaining("1937 edition"),
    ])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    const diameter = rowOf("Birch to Cedar", "Diameter")
    expect(diameter).toHaveTextContent("Diameter")
    expect(diameter).toHaveTextContent("1 proposal")
    // The proposed value is not shown as if it were cited.
    expect(diameter).toHaveTextContent("Unknown")
    expect(diameter).not.toHaveTextContent("8 in")

    // Opening the claim shows what is proposed and on what evidence.
    await user.click(diameter)
    const detail = screen.getByRole("region", {
      name: "Diameter of Birch to Cedar",
    })
    const proposal = within(detail).getByRole("article")
    expect(proposal).toHaveTextContent("Unknown")
    expect(proposal).toHaveTextContent("8 in")
    expect(proposal).toHaveTextContent("1937 edition.")
    expect(detail).toHaveTextContent("No source cites this claim yet.")
    // Deciding is not built: nothing here pretends to accept or reject.
    expect(
      within(detail).queryByRole("button", { name: /Accept|Reject/ })
    ).toBeNull()
  })

  it("works through the sections in no pipeline, one by one", async () => {
    const user = await open()
    // Unplaced: every section in no pipeline, under the edition that first
    // shows it.
    await user.click(screen.getByRole("button", { name: "Unplaced" }))
    const sections = screen.getByRole("listbox", { name: "Unplaced" })
    expect(
      screen.getByRole("combobox", { name: "Search name or code" })
    ).toBeVisible()
    // A group's sections are listed on the right, where they are read.
    await user.click(
      within(sections).getByRole("option", { name: /1937 edition/ })
    )
    const section = screen.getByRole("treeitem", { name: /Unnamed section/ })
    expect(section).not.toHaveTextContent("cited")
    // The group's only section: it is open to its claims already.
    // In no pipeline, one proposed: the Pipeline row says so; no Owner row.
    const pipeline = rowOf("Unnamed section", "Pipeline")
    expect(pipeline).toHaveTextContent("Not yet P-003's")
    expect(pipeline).toHaveTextContent("1 proposal")
    expect(within(claimsOf("Unnamed section")).queryByText("Owner")).toBeNull()
    await user.click(pipeline)
    const detail = screen.getByRole("region", {
      name: "Pipeline of Unnamed section",
    })
    expect(detail).toHaveTextContent(
      "The stitch tool proposes that this section is part of P-003, whose name is Unknown. Score 0.70."
    )
    // Nothing decides: the one button here only asks the Agent.
    expect(
      within(detail)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["ProposedAsk the Agent about this"])
    expect(window.location.search).toContain("sc=unplaced")
  })

  it("looks at only the unplaced sections, and keeps what was selected", async () => {
    const user = await open()
    expect(screen.getByRole("heading", { name: "Network" })).toBeVisible()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    const selected = [...useStudio.getState().selection]

    await user.click(screen.getByRole("button", { name: "Unplaced" }))
    // The title, the column and the rows follow; the selection does not.
    expect(screen.getByRole("heading", { name: "Unplaced" })).toBeVisible()
    expect(rows()).toEqual([expect.stringContaining("1937 edition")])
    expect([...useStudio.getState().selection]).toEqual(selected)
    expect(window.location.search).toContain("sc=unplaced")
    // The pipeline's sections are still read on the right, though hidden.
    expect(screen.getByRole("heading", { name: "North line" })).toBeVisible()
    // There is no edition to choose: no edition is in force.
    expect(screen.queryByRole("combobox", { name: /Edition/ })).toBeNull()
  })

  it("hands two pipelines to the Agent and is ready to type", async () => {
    const user = await open()
    await user.click(
      within(list()).getByRole("checkbox", { name: "Select North line" })
    )
    await user.click(
      within(list()).getByRole("checkbox", { name: "Select South line" })
    )
    expect(screen.getByRole("heading", { name: "2 pipelines" })).toBeVisible()

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("option", { name: /North line/ }),
    })
    await user.click(await screen.findByRole("menuitem", { name: "Ask" }))

    const agent = screen.getByRole("complementary", { name: "agent" })
    expect(within(agent).getByText("North line")).toBeVisible()
    expect(within(agent).getByText("South line")).toBeVisible()
    expect(
      within(agent).getByRole("textbox", { name: "Message to the Agent" })
    ).toHaveFocus()
  })

  it("hands an edition to the Agent as its sections, which outlast the switch", async () => {
    const user = await open()
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("option", { name: /1937 edition/ }),
    })
    await user.click(await screen.findByRole("menuitem", { name: "Ask" }))
    // A group is only a way of listing: never "all" of it.
    expect(useStudio.getState().agentAttachments).toEqual([
      { pipelineId: "unassigned:ed-1937", sectionIds: ["s-4"] },
    ])
    const agent = screen.getByRole("complementary", { name: "agent" })
    expect(within(agent).getByText("Unnamed section")).toBeVisible()
    // On Pipelines, where the edition has no row, it is still attached.
    act(() => useStudio.getState().setScope("pipelines"))
    expect(within(agent).getByText("Unnamed section")).toBeVisible()
  })

  it("finds nothing in the top bar that does nothing when pressed", async () => {
    await open()
    const bar = screen
      .getByRole("heading", { level: 1 })
      .closest("header") as HTMLElement
    expect(
      within(bar)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Help"])
    for (const name of ["Menu", "Undo", "Redo", "Export", "Review changes"]) {
      expect(
        within(bar).queryByRole("button", { name })
      ).not.toBeInTheDocument()
    }
  })
})
