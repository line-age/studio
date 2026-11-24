import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseNetwork } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * On store's data only the Agent service answers. A message sent while it is
 * still answering waits and goes when it finishes; one it cannot take (the
 * service is not running, a second message while one waits) stays in the box
 * and the panel says why. Nothing is lost silently.
 */

const service = vi.hoisted(() => ({
  thread: "ready" as "ready" | "down" | "starting",
  working: false,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    service.listeners.add(listener)
    return () => service.listeners.delete(listener)
  },
  /** The run ends (or starts), as the stream would say. */
  setWorking(working: boolean) {
    service.working = working
    service.listeners.forEach((listener) => listener())
  },
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
vi.mock("@/data/agent/use-agent", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useSharedThread: () => service.thread,
    useAgent: () => ({
      turns: [],
      liveSteps: [],
      ask: service.ask,
      stop: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      working: useSyncExternalStore(service.subscribe, () => service.working),
      error: null,
    }),
  }
})

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

  it("waits while the Agent is still answering, then is sent", async () => {
    service.working = true
    const { user, agent, box } = await open()
    await user.type(box, "And the diameter?{Enter}")
    expect(service.ask).not.toHaveBeenCalled()
    expect(box).toHaveValue("")
    expect(
      within(agent).getByText(/Your message is sent when it finishes/)
    ).toBeInTheDocument()
    act(() => service.setWorking(false))
    await waitFor(() => expect(service.ask).toHaveBeenCalledOnce())
    expect(service.ask.mock.calls[0][0]).toMatchObject({
      words: "And the diameter?",
    })
  })

  it("keeps a second message in the box while one waits", async () => {
    service.working = true
    const { user, agent, box } = await open()
    await user.type(box, "And the diameter?{Enter}")
    await user.type(box, "And the owner?{Enter}")
    expect(box).toHaveValue("And the owner?")
    expect(
      within(agent).getByText(/Your message waits here/)
    ).toBeInTheDocument()
    act(() => service.setWorking(false))
    await waitFor(() => expect(service.ask).toHaveBeenCalledOnce())
  })

  it("goes back to the box when the chat is cleared", async () => {
    service.working = true
    const { user, agent, box } = await open()
    await user.type(box, "And the diameter?{Enter}")
    await user.click(within(agent).getByRole("button", { name: "Clear chat" }))
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Clear chat",
      })
    )
    act(() => service.setWorking(false))
    await waitFor(() => expect(box).toHaveValue("And the diameter?"))
    expect(service.ask).not.toHaveBeenCalled()
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

  it("does not put a failed question over words typed since", async () => {
    service.fails = true
    let fail: () => void = () => undefined
    service.ask.mockImplementationOnce((_q: unknown, onFailed?: () => void) => {
      fail = () => onFailed?.()
      return Promise.resolve()
    })
    const { user, box } = await open()
    await user.type(box, "Who owns it?{Enter}")
    await user.type(box, "Something else")
    act(() => fail())
    expect(box).toHaveValue("Something else")
  })
})
