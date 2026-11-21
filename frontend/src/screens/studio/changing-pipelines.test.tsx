import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * A person changes pipelines and decides proposals. On the sample a change
 * is made in memory, so this runs without store.
 */

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(testNetwork()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))
// The real change, counted: a decision pressed twice must be made once.
const applied = vi.hoisted(() => ({ count: 0 }))
vi.mock("@/data/changes", async (original) => {
  const real = await original<typeof import("@/data/changes")>()
  return {
    ...real,
    applyChange: (...args: Parameters<typeof real.applyChange>) => {
      applied.count += 1
      return real.applyChange(...args)
    },
  }
})

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

async function open() {
  await act(async () => {
    render(<StudioScreen />)
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

describe("Change pipeline", () => {
  it("takes one section out of its pipeline, from the right-click menu", async () => {
    const user = await open()
    await user.click(screen.getByRole("option", { name: /North line/ }))
    // Leave one section ticked: the menu then changes that section alone.
    await user.click(
      screen.getByRole("checkbox", { name: "Select Birch to Cedar" })
    )
    const row = screen.getByRole("treeitem", { name: /Alder to Birch/ })
    await user.pointer({ keys: "[MouseRight]", target: row })
    await user.click(
      await screen.findByRole("menuitem", { name: "Change pipeline" })
    )
    const dock = within(screen.getByRole("region", { name: "Change pipeline" }))
    await user.click(dock.getByRole("combobox"))
    await user.click(
      await screen.findByRole("option", { name: "Not in a pipeline" })
    )
    await user.click(dock.getByRole("button", { name: "Change" }))
    expect(
      await screen.findByText("The section is in no pipeline now.")
    ).toBeTruthy()
  })
})
