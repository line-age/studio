import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { useSettings } from "./settings"
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

const list = () => screen.getByRole("listbox", { name: "Pipelines" })
const rows = () =>
  within(list())
    .getAllByRole("option")
    .map((row) => row.textContent ?? "")
const count = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Sections by status" })).getByRole(
    "button",
    { name }
  )
const rowOf = (section: string, attribute: string) =>
  within(claimsOf(section))
    .getAllByRole("treeitem")
    .find((row) => row.textContent?.startsWith(attribute))!
const rail = (name: string) =>
  within(screen.getByRole("navigation", { name: "Panels" })).getByRole(
    "button",
    { name: new RegExp(name) }
  )
const claimsOf = (section: string) =>
  screen.getByRole("group", { name: `Claims of ${section}` })

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("reviewing", () => {
  it("finds what is not started and sees which section it is", async () => {
    const user = await open()
    expect(count(/^All/)).toHaveTextContent("All4")
    expect(count(/^Not started/)).toHaveTextContent("Not started2")

    await user.click(count(/^Not started/))
    // South line is done, so it goes; the other two rows hold one each.
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("P-003"),
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
      screen.getByRole("combobox", { name: "Search pipelines" }),
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

  it("reads the source behind a value: which one, where, and puts it away", async () => {
    const user = await open()
    await user.type(
      screen.getByRole("combobox", { name: "Search pipelines" }),
      "alder to{Enter}"
    )
    await user.click(rowOf("Alder to Birch", "Diameter"))
    const detail = screen.getByRole("region", {
      name: "Diameter of Alder to Birch",
    })
    expect(detail).toHaveTextContent("12 in")
    expect(detail).toHaveTextContent("Cited")
    // One source: it is shown open, with the place in it.
    const sources = within(detail).getByRole("list", { name: "Sources" })
    const source = within(sources).getByRole("button", { name: "1937 edition" })
    expect(source).toHaveAttribute("aria-expanded", "true")
    expect(sources).toHaveTextContent("Where")
    expect(sources).toHaveTextContent("grid ref. A-1")
    await user.click(source)
    expect(sources).not.toHaveTextContent("grid ref. A-1")

    await user.click(
      within(detail).getByRole("button", { name: "Close the claim" })
    )
    expect(screen.queryByRole("region", { name: /^Diameter of/ })).toBeNull()
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
    await user.click(screen.getByRole("button", { name: "Show 2 sections" }))

    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Unknown diameter")
    expect(count(/^All/)).toHaveTextContent("All2")
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("P-003"),
    ])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    expect(rowOf("Birch to Cedar", "Diameter")).toHaveTextContent("Unknown")
  })

  it("reads who owned a pipeline, and when, from one of its sections", async () => {
    const user = await open()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    // The pipeline's own claims sit above its sections, each with its period.
    const own = screen.getByRole("group", { name: "Claims about North line" })
    expect(own).toHaveTextContent("Alder Gas Co., by 1931")
    expect(own).toHaveTextContent("Yew Fuel Co., from 1936")
    // No source names it or its operator: both Unknown, in words.
    expect(own).toHaveTextContent("NameUnknown")
    expect(own).toHaveTextContent("OperatorUnknown")

    // From a section, Owner leads back to the pipeline as a whole.
    act(() => useStudio.getState().select(["s-1"]))
    await user.click(screen.getByRole("treeitem", { name: /Alder to Birch/ }))
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
      screen.getByRole("combobox", { name: "Search pipelines" }),
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
    expect(count(/^Needs your decision/)).toHaveTextContent("2")
    await user.click(count(/^Needs your decision/))
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("P-003"),
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
    // They are in the Sections list only.
    await user.click(rail("Sections"))
    const sections = screen.getByRole("listbox", { name: "Sections" })
    expect(
      screen.getByRole("combobox", { name: "Search sections" })
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "List the sections first seen in the 1937 edition",
      })
    )
    const section = within(sections)
      .getByText("Unnamed section")
      .closest<HTMLElement>("[role=option]")!
    expect(section).toHaveTextContent("0/2")
    expect(section).toHaveTextContent("Not started")
    await user.click(section)
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
    expect(within(detail).getAllByRole("button")).toHaveLength(1)
    expect(window.location.search).toContain("l=sections")
  })

  it("looks at the network as an earlier edition shows it", async () => {
    const user = await open()
    await user.click(
      screen.getByRole("combobox", {
        name: "Edition the network is shown as of",
      })
    )
    await user.click(await screen.findByRole("option", { name: /1931/ }))
    // 1931 shows one section of each line, and nothing outside a pipeline.
    expect(count(/^All/)).toHaveTextContent("All2")
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("South line"),
    ])
    expect(window.location.search).toContain("e=ed-1931")
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
    await user.click(
      await screen.findByRole("menuitem", { name: "Add to the Agent chat" })
    )

    const agent = screen.getByRole("complementary", { name: "agent" })
    expect(within(agent).getByText("North line")).toBeVisible()
    expect(within(agent).getByText("South line")).toBeVisible()
    expect(
      within(agent).getByPlaceholderText(/Ask about a section/)
    ).toHaveFocus()
  })

  it("loosens the rule and sees the work counted again", async () => {
    const user = await open()
    expect(count(/^Done/)).toHaveTextContent("Done2")
    await user.click(screen.getByRole("button", { name: "Settings" }))
    const dialog = screen.getByRole("dialog", { name: "Settings" })
    // Owner is the pipeline's: the rule cannot ask a section for it.
    expect(within(dialog).queryByRole("checkbox", { name: "Owner" })).toBeNull()
    for (const name of ["Diameter", "Build date"]) {
      await user.click(within(dialog).getByRole("checkbox", { name }))
    }
    // Nothing required: every section in a pipeline is done.
    const done = screen.getByRole("button", { name: /^Done/, hidden: true })
    expect(done).toHaveTextContent("Done3")
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
    ).toEqual(["Settings", "Help"])
    for (const name of ["Menu", "Undo", "Redo", "Export", "Review changes"]) {
      expect(
        within(bar).queryByRole("button", { name })
      ).not.toBeInTheDocument()
    }
  })
})
