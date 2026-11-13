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
 * The test network as of 1937: North line (Alder to Birch with owner and
 * diameter cited; Birch to Cedar with neither, and a diameter proposed),
 * South line (Dale to Elm, owner and diameter cited) and one section in no
 * pipeline with no owner.
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

const list = () => screen.getByRole("listbox", { name: "Sections" })
const rows = () =>
  within(list())
    .getAllByRole("option")
    .map((row) => row.textContent ?? "")
const count = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Sections by status" })).getByRole(
    "button",
    { name }
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
    // South line has begun, so it goes; the other two rows hold one each.
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
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
      screen.getByRole("combobox", { name: "Search sections" }),
      "alder to{Enter}"
    )
    const claims = within(claimsOf("Alder to Birch")).getAllByRole("treeitem")
    expect(claims[0]).toHaveTextContent("Owner")
    expect(claims[0]).toHaveTextContent("Alder Gas Co.")
    expect(claims[0]).toHaveTextContent("Cited by1source")
    expect(claims[1]).toHaveTextContent("12 in")
    // The link now points at this section.
    expect(window.location.search).toContain("sel=s-1")
  })

  it("reads the source behind a value: which one, where, and puts it away", async () => {
    const user = await open()
    await user.type(
      screen.getByRole("combobox", { name: "Search sections" }),
      "alder to{Enter}"
    )
    await user.click(
      within(claimsOf("Alder to Birch")).getAllByRole("treeitem")[0]
    )
    const detail = screen.getByRole("region", {
      name: "Owner of Alder to Birch",
    })
    expect(detail).toHaveTextContent("Alder Gas Co.")
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
    expect(screen.queryByRole("region", { name: /^Owner of/ })).toBeNull()
    // The section stays open above.
    expect(claimsOf("Alder to Birch")).toBeVisible()
  })

  it("lists every section with no owner and opens one", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: "Filters" }))
    await user.click(
      within(screen.getByRole("group", { name: "Unknown in" })).getByRole(
        "checkbox",
        { name: /Owner/ }
      )
    )
    await user.click(screen.getByRole("button", { name: "Show 2 sections" }))

    expect(
      screen.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("Unknown owner")
    expect(count(/^All/)).toHaveTextContent("All2")
    expect(rows()).toEqual([
      expect.stringContaining("North line"),
      expect.stringContaining("1937 edition"),
    ])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    const owner = within(claimsOf("Birch to Cedar")).getAllByRole("treeitem")[0]
    expect(owner).toHaveTextContent("Owner")
    expect(owner).toHaveTextContent("Unknown")
  })

  it("finds the proposal that waits for a decision", async () => {
    const user = await open()
    expect(count(/^Needs your decision/)).toHaveTextContent("1")
    await user.click(count(/^Needs your decision/))
    expect(rows()).toEqual([expect.stringContaining("North line")])

    await user.click(screen.getByRole("option", { name: /North line/ }))
    await user.click(screen.getByRole("treeitem", { name: /Birch to Cedar/ }))
    const diameter = within(claimsOf("Birch to Cedar")).getAllByRole(
      "treeitem"
    )[1]
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
    await user.click(
      screen.getByRole("button", {
        name: "List the sections first seen in the 1937 edition",
      })
    )
    const section = within(list())
      .getByText("Unnamed section")
      .closest<HTMLElement>("[role=option]")!
    expect(section).toHaveTextContent("0/3")
    expect(section).toHaveTextContent("Not started")
    await user.click(section)
    expect(
      within(claimsOf("Unnamed section")).getAllByRole("treeitem")[0]
    ).toHaveTextContent("Unknown")
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
    expect(count(/^Done/)).toHaveTextContent("Done0")
    await user.click(screen.getByRole("button", { name: "Settings" }))
    await user.click(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole(
        "checkbox",
        { name: "Build date" }
      )
    )
    // Owner and diameter are enough now: two sections in pipelines are done.
    const done = screen.getByRole("button", { name: /^Done/, hidden: true })
    expect(done).toHaveTextContent("Done2")
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
