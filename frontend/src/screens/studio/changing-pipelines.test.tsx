import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { toast } from "sonner"

import { Toaster } from "@/components/ui/sonner"
import { testNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * A person changes pipelines and decides proposals. On the sample a change
 * is made in memory, so this runs without store.
 */

const reads = vi.hoisted(() => ({ count: 0 }))
vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => {
    reads.count += 1
    return Promise.resolve(testNetwork())
  },
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))
// The real change, counted: a decision pressed twice must be made once.
const applied = vi.hoisted(() => ({
  count: 0,
  decidedElsewhere: false,
  // The next change gets no answer, as when store did it but the reply is lost.
  loseNext: false,
  keys: [] as string[],
}))
vi.mock("@/data/changes", async (original) => {
  const real = await original<typeof import("@/data/changes")>()
  const { WriteError } = await import("@/data/store/write")
  return {
    ...real,
    applyChange: (...args: Parameters<typeof real.applyChange>) => {
      applied.count += 1
      applied.keys.push(args[2])
      if (applied.decidedElsewhere) throw new WriteError("decided")
      if (applied.loseNext) {
        applied.loseNext = false
        throw new WriteError("unreachable")
      }
      return real.applyChange(...args)
    },
  }
})

beforeEach(() => {
  // Sonner keeps its toasts between renders: start each test with none.
  toast.dismiss()
  applied.keys = []
  applied.loseNext = false
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

async function open() {
  await act(async () => {
    render(
      <>
        <StudioScreen />
        <Toaster />
      </>
    )
  })
  return userEvent.setup()
}

const agent = () => screen.getByRole("complementary", { name: "agent" })

describe("deciding proposals in the Agent", () => {
  it("lists what tools proposed, and a confirm places the section", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: /Agent/ }))
    const inbox = within(agent())
    await user.click(inbox.getByRole("button", { name: /proposals? waiting/ }))
    const proposals = inbox.getByRole("list", { name: "Proposals waiting" })
    const before = within(proposals).getAllByRole("listitem").length
    const pipeline = within(proposals)
      .getByText("1 section could be one pipeline.")
      .closest("li")!
    await user.click(
      within(pipeline as HTMLElement).getByRole("button", {
        name: "Confirm all 1",
      })
    )
    expect(
      within(proposals).queryByText("1 section could be one pipeline.")
    ).toBeNull()
    expect(within(proposals).getAllByRole("listitem")).toHaveLength(before - 1)
  })

  it("accepts a candidate claim", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: /Agent/ }))
    const inbox = within(agent())
    await user.click(inbox.getByRole("button", { name: /proposals? waiting/ }))
    const item = inbox.getByText("Diameter of Birch to Cedar").closest("li")!
    await user.click(
      within(item as HTMLElement).getByRole("button", { name: "Accept" })
    )
    expect(inbox.queryByText("Diameter of Birch to Cedar")).toBeNull()
  })
})

describe("a decision pressed twice", () => {
  it("is made once", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: /Agent/ }))
    const inbox = within(agent())
    await user.click(inbox.getByRole("button", { name: /proposals? waiting/ }))
    const item = inbox.getByText("Diameter of Birch to Cedar").closest("li")!
    const accept = within(item as HTMLElement).getByRole("button", {
      name: "Accept",
    })
    applied.count = 0
    await act(async () => {
      accept.click()
      accept.click()
    })
    expect(applied.count).toBe(1)
  })
})

describe("a proposal someone else decided first", () => {
  it("says so and reads the network again", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: /Agent/ }))
    const inbox = within(agent())
    await user.click(inbox.getByRole("button", { name: /proposals? waiting/ }))
    const item = inbox.getByText("Diameter of Birch to Cedar").closest("li")!
    applied.decidedElsewhere = true
    const before = reads.count
    try {
      await user.click(
        within(item as HTMLElement).getByRole("button", { name: "Accept" })
      )
    } finally {
      applied.decidedElsewhere = false
    }
    expect(reads.count).toBe(before + 1)
    expect(within(item as HTMLElement).queryByRole("alert")).toBeNull()
  })
})

type User = ReturnType<typeof userEvent.setup>

async function rightClick(user: User, target: Element, item: string) {
  await user.pointer({ keys: "[MouseRight]", target })
  await user.click(await screen.findByRole("menuitem", { name: item }))
  return within(await screen.findByRole("dialog"))
}

/** Alder to Birch, ticked alone in North line, right-clicked. */
async function oneSection(user: User, item: string) {
  await user.click(screen.getByRole("option", { name: /North line/ }))
  // Leave one section ticked: the menu then changes that section alone.
  await user.click(
    screen.getByRole("checkbox", { name: "Select Birch to Cedar" })
  )
  const row = screen.getByRole("treeitem", { name: /Alder to Birch/ })
  return rightClick(user, row, item)
}

const pipelineRow = () => screen.getByRole("option", { name: /North line/ })

describe("a section's menu", () => {
  it("offers Edit, Move to a pipeline and Remove from its pipeline, no dots", async () => {
    const user = await open()
    await user.click(pipelineRow())
    await user.click(
      screen.getByRole("checkbox", { name: "Select Birch to Cedar" })
    )
    const row = screen.getByRole("treeitem", { name: /Alder to Birch/ })
    await user.pointer({ keys: "[MouseRight]", target: row })
    const items = (await screen.findAllByRole("menuitem")).map(
      (item) => item.textContent
    )
    expect(items).toEqual([
      "Edit",
      "Move to a pipeline",
      "Remove from North line",
      "Ask",
    ])
  })

  it("removes a section from its pipeline: the modal opens on Not in a pipeline", async () => {
    const user = await open()
    const modal = await oneSection(user, "Remove from North line")
    expect(
      modal.getByRole("radio", { name: "Not in a pipeline" })
    ).toBeChecked()
    expect(
      modal.getByText("Will take 1 section out of North line")
    ).toBeTruthy()
    await user.click(
      modal.getByRole("button", { name: "Remove from pipeline" })
    )
    expect(
      await screen.findAllByText("The section is in no pipeline now.")
    ).not.toHaveLength(0)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens Move with nothing chosen, so one press cannot move a section", async () => {
    const user = await open()
    const modal = await oneSection(user, "Move to a pipeline")
    for (const radio of modal.getAllByRole("radio")) {
      expect(radio).not.toBeChecked()
    }
    expect(modal.getByText("No changes yet")).toBeTruthy()
    expect(modal.getByRole("button", { name: /^Move/ })).toBeDisabled()
    // Its own pipeline is not a place to move it to; a search narrows.
    expect(modal.queryByRole("radio", { name: /North line/ })).toBeNull()
    await user.type(
      modal.getByRole("textbox", { name: "Find a pipeline" }),
      "south"
    )
    expect(
      modal.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))
    ).toEqual(["South line · P-002", "Not in a pipeline"])
  })

  it("moves a section, and the toast says where it is now", async () => {
    const user = await open()
    const modal = await oneSection(user, "Move to a pipeline")
    await user.click(modal.getByRole("radio", { name: "South line · P-002" }))
    expect(modal.getByText("Will move 1 section to South line")).toBeTruthy()
    await user.click(modal.getByRole("button", { name: "Move 1 section" }))
    expect(
      await screen.findByText("The section is in South line now.")
    ).toBeTruthy()
  })

  it("undoes a move from the toast, and says it is undone", async () => {
    const user = await open()
    const modal = await oneSection(user, "Move to a pipeline")
    await user.click(modal.getByRole("radio", { name: "South line · P-002" }))
    await user.click(modal.getByRole("button", { name: "Move 1 section" }))
    await screen.findByText("The section is in South line now.")
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(
      await screen.findByText("Undone: The section is in South line now.")
    ).toBeTruthy()
    // Back in North line: its row counts both sections again.
    expect(
      screen.getByRole("option", { name: /North line/ })
    ).toHaveTextContent("/2")
  })

  it("stays open when not saved, and Try again sends the same change with the same key", async () => {
    const user = await open()
    const modal = await oneSection(user, "Remove from North line")
    applied.loseNext = true
    await user.click(
      modal.getByRole("button", { name: "Remove from pipeline" })
    )
    const alert = await modal.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't save. Nothing was changed.")
    expect(alert).toHaveTextContent("The connection dropped. Try again.")
    await user.click(modal.getByRole("button", { name: "Try again" }))
    expect(
      await screen.findAllByText("The section is in no pipeline now.")
    ).not.toHaveLength(0)
    expect(applied.keys).toHaveLength(2)
    expect(applied.keys[1]).toBe(applied.keys[0])
  })

  it("sends a different choice as a new change, never as the lost one", async () => {
    const user = await open()
    const modal = await oneSection(user, "Move to a pipeline")
    await user.click(modal.getByRole("radio", { name: "South line · P-002" }))
    applied.loseNext = true
    await user.click(modal.getByRole("button", { name: "Move 1 section" }))
    expect(await modal.findByRole("alert")).toBeTruthy()
    await user.click(modal.getByRole("radio", { name: "Not in a pipeline" }))
    await user.click(
      modal.getByRole("button", { name: "Remove from pipeline" })
    )
    expect(
      await screen.findAllByText("The section is in no pipeline now.")
    ).not.toHaveLength(0)
    expect(applied.keys).toHaveLength(2)
    expect(applied.keys[1]).not.toBe(applied.keys[0])
  })
})

describe("a pipeline row's menu", () => {
  it("edits the pipeline and its sections, and never makes one again", async () => {
    const user = await open()
    await user.click(pipelineRow())
    await user.pointer({ keys: "[MouseRight]", target: pipelineRow() })
    const items = (await screen.findAllByRole("menuitem")).map(
      (item) => item.textContent
    )
    expect(items).toEqual([
      "Edit pipeline",
      "Sections",
      "Add to the Agent chat",
    ])
  })

  it("edits a pipeline's name: Save waits for a change, then the list shows it", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Edit pipeline")
    expect(modal.getByText(/P-001 · 2 sections/)).toBeTruthy()
    const name = modal.getByRole("textbox", { name: "Name" })
    expect(name).toHaveValue("North line")
    expect(modal.getByRole("button", { name: "Save" })).toBeDisabled()
    await user.clear(name)
    await user.type(name, "Calder Valley")
    expect(modal.getByText("Will update Name")).toBeTruthy()
    await user.click(modal.getByRole("button", { name: "Save" }))
    expect(
      await screen.findByText("Updated Name on Calder Valley.")
    ).toBeTruthy()
    expect(screen.getByRole("option", { name: /Calder Valley/ })).toBeTruthy()
  })

  it("adds an owner to a pipeline, with why, and says so", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Edit pipeline")
    const owner = modal.getByRole("textbox", { name: "Owner" })
    await user.clear(owner)
    await user.type(owner, "Birch Gas Co.")
    await user.type(
      modal.getByRole("textbox", { name: "Note" }),
      "sold in 1950"
    )
    expect(modal.getByText("Will update Owner")).toBeTruthy()
    await user.click(modal.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Updated Owner on North line.")).toBeTruthy()
  })

  it("leaves a pipeline as it was when a field is emptied: emptying is not a change", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Edit pipeline")
    await user.clear(modal.getByRole("textbox", { name: "Name" }))
    expect(modal.getByText("No changes yet")).toBeTruthy()
    expect(modal.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("changes a pipeline's sections in one save: one removed, one found and added", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Sections")
    await user.click(
      modal.getByRole("button", { name: /^Remove .*Alder to Birch/ })
    )
    expect(modal.getByText("Will be removed")).toBeTruthy()
    await user.type(
      modal.getByRole("combobox", { name: "Add a section: code or name" }),
      "Dale"
    )
    await user.click(modal.getByRole("option", { name: /Dale to Elm/ }))
    expect(modal.getByText("New · leaves South line")).toBeTruthy()
    expect(modal.getByText("Will add 1 section and remove 1")).toBeTruthy()
    await user.click(modal.getByRole("button", { name: "Save changes" }))
    expect(
      await screen.findByText("Added 1 section to North line and removed 1.")
    ).toBeTruthy()
    expect(applied.count).toBeGreaterThan(0)
  })

  it("lists a section already in the pipeline as found but greyed", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Sections")
    await user.type(
      modal.getByRole("combobox", { name: "Add a section: code or name" }),
      "Birch"
    )
    for (const option of modal.getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-disabled", "true")
    }
  })

  it("folds into the bar to pick on the map, and Cancel there keeps the draft as it was", async () => {
    const user = await open()
    const modal = await rightClick(user, pipelineRow(), "Sections")
    await user.click(
      modal.getByRole("button", { name: /Remove .*Alder to Birch/ })
    )
    await user.click(modal.getByRole("button", { name: "Pick on the map" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => useStudio.getState().togglePick("s-3", false))
    act(() => useStudio.getState().stopPicking(false))
    const back = within(await screen.findByRole("dialog"))
    expect(back.getByText("Will remove 1 section")).toBeTruthy()
  })
})

describe("several sections' menu", () => {
  it("makes a pipeline with a name, in one change", async () => {
    const user = await open()
    await user.click(pipelineRow())
    const row = screen.getByRole("treeitem", { name: /Alder to Birch/ })
    const modal = await rightClick(user, row, "Make pipeline")
    expect(modal.getByText("2 sections")).toBeTruthy()
    expect(modal.getByText(/is in North line and will leave it/)).toBeTruthy()
    await user.type(
      modal.getByRole("textbox", { name: "Name" }),
      "Calder Valley"
    )
    await user.click(modal.getByRole("button", { name: "Make pipeline" }))
    expect(
      await screen.findByText("Made Calder Valley, a pipeline of 2 sections.")
    ).toBeTruthy()
  })
})
