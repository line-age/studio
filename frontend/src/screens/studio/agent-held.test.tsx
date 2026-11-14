import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseNetwork } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * On store's data only the Agent service answers. A message it cannot take,
 * because it is still answering or is not running, stays in the box and the
 * panel says why. Nothing is lost silently.
 */

const service = vi.hoisted(() => ({
  thread: "ready" as "ready" | "down" | "starting",
  working: false,
  fails: false,
  ask: vi.fn((_question: unknown, onFailed?: () => void) => {
    // A failure always arrives after the send, as from the network.
    return Promise.resolve().then(() => {
      if (service.fails) onFailed?.()
    })
  }),
}))

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  dataSource: () => "store",
  loadNetwork: () => Promise.resolve(parseNetwork(evidenceNetwork())),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))
vi.mock("@/data/agent/use-agent", () => ({
  useSharedThread: () => service.thread,
  useAgent: () => ({
    turns: [],
    ask: service.ask,
    stop: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    working: service.working,
    error: null,
  }),
}))

async function open() {
  await act(async () => {
    render(<StudioScreen />)
  })
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: /^Agent/ }))
  const agent = screen.getByRole("complementary", { name: "agent" })
  return { user, agent, box: within(agent).getByRole("textbox") }
}

describe("a message the Agent cannot take", () => {
  beforeEach(() => {
    // jsdom does not scroll; the conversation keeps its newest turn in view.
    Element.prototype.scrollTo = () => undefined
    localStorage.clear()
    useSettings.getState().reset()
    window.history.replaceState(null, "", "/")
    useStudio.setState(useStudio.getInitialState(), true)
    useCamera.setState(useCamera.getInitialState(), true)
    service.thread = "ready"
    service.working = false
    service.fails = false
    service.ask.mockClear()
  })

  it("is sent and leaves the box when the Agent is free", async () => {
    const { user, box } = await open()
    await user.type(box, "Who owns it?{Enter}")
    expect(service.ask).toHaveBeenCalledOnce()
    expect(box).toHaveValue("")
  })

  it("stays in the box while the Agent is still answering", async () => {
    service.working = true
    const { user, agent, box } = await open()
    await user.type(box, "And the diameter?{Enter}")
    expect(service.ask).not.toHaveBeenCalled()
    expect(box).toHaveValue("And the diameter?")
    expect(
      within(agent).getByText(/The Agent is still answering/)
    ).toBeInTheDocument()
  })

  it("stays in the box when the service is not running", async () => {
    service.thread = "down"
    const { user, agent, box } = await open()
    await user.type(box, "Who owns it?{Enter}")
    expect(box).toHaveValue("Who owns it?")
    expect(
      within(agent).getByText(/Your message waits here/)
    ).toBeInTheDocument()
  })

  it("comes back to the box when the run fails", async () => {
    service.fails = true
    const { user, box } = await open()
    await user.type(box, "Who owns it?{Enter}")
    expect(service.ask).toHaveBeenCalledOnce()
    await waitFor(() => expect(box).toHaveValue("Who owns it?"))
  })
})
