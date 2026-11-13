import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import { StudioScreen } from "../studio-screen"
import { useCamera, useStudio } from "../studio-store"

import { TOUR_SEEN_KEY, useHelp } from "./help-store"
import { HELP_STEPS } from "./steps"

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(testNetwork()),
}))
vi.mock("../map/map-area", () => ({ MapArea: () => null }))

async function renderScreen() {
  await act(async () => {
    render(<StudioScreen />)
  })
}

const card = () => screen.findByRole("dialog", { name: /./ })
const cardTitle = async () =>
  within(await card()).getByRole("heading").textContent

/** The step's area: on screen and not inside a hidden panel. */
const area = (index: number) =>
  HELP_STEPS[index].targets
    .map((name) => document.querySelector(`[data-tour="${name}"]`))
    .find((element) => element && !element.closest("[inert]"))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("the Help tour", () => {
  it("starts by itself on a first visit, and not after it was skipped", async () => {
    useHelp.setState({ seen: false })
    const user = userEvent.setup()
    await renderScreen()
    expect(await cardTitle()).toBe("What Studio is")
    expect(within(await card()).getByText("1 of 10")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Skip" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(useHelp.getState().seen).toBe(true)
    expect(localStorage.getItem(TOUR_SEEN_KEY)).not.toBeNull()
  })

  it("does not start for someone who has seen it", async () => {
    await renderScreen()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("moves with Next and Back, and Escape ends it", async () => {
    useHelp.setState({ seen: false })
    const user = userEvent.setup()
    await renderScreen()
    await card()
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(await cardTitle()).toBe("Pipelines and Sections")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await cardTitle()).toBe("What Studio is")

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(useHelp.getState().seen).toBe(true)
  })

  it("has an area on screen for every step", async () => {
    await renderScreen()
    for (const [index, step] of HELP_STEPS.entries()) {
      act(() => useHelp.getState().start(index))
      if (step.targets.length > 0) {
        await waitFor(() => expect(area(index)).toBeTruthy())
      }
      // Still on the step: it was not passed over for want of an area.
      expect(await cardTitle()).toBe(step.title)
      act(() => useHelp.getState().end())
    }
  })

  it("brings the side panels back for a step about the list", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(
      screen.getByRole("button", { name: "Hide the side panels" })
    )
    act(() => useHelp.getState().start(1))
    await waitFor(() => expect(area(1)).toBeTruthy())
    // And leaves the screen as it found it.
    act(() => useHelp.getState().end())
    expect(
      await screen.findByRole("button", { name: "Show the side panels" })
    ).toBeVisible()
  })

  it("selects a section to show the claims, and lets go of it after", async () => {
    await renderScreen()
    const claims = HELP_STEPS.findIndex((step) => step.id === "claims")
    act(() => useHelp.getState().start(claims))
    await waitFor(() => expect(area(claims)).toBeTruthy())
    expect(useStudio.getState().selection.size).toBe(1)
    act(() => useHelp.getState().end())
    expect(useStudio.getState().selection.size).toBe(0)
  })

  it("opens the Agent panel for its step, and goes back to the list after", async () => {
    await renderScreen()
    const agent = HELP_STEPS.findIndex((step) => step.id === "agent-panel")
    act(() => useHelp.getState().start(agent))
    await waitFor(() => expect(area(agent)).toBeTruthy())
    expect(screen.getByRole("log")).toBeInTheDocument()
    act(() => useHelp.getState().end())
    expect(
      await screen.findByRole("combobox", { name: "Search pipelines" })
    ).toBeInTheDocument()
  })

  it("ends with Done on the last step", async () => {
    const user = userEvent.setup()
    await renderScreen()
    act(() => useHelp.getState().start(HELP_STEPS.length - 1))
    await card()
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

/** Help is a menu; its last item opens the help topics. */
async function openTopics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Help" }))
  await user.click(await screen.findByRole("menuitem", { name: "Help topics" }))
  return screen.findByRole("dialog", { name: "Help" })
}

describe("the Help menu", () => {
  it("offers the tour, the Agent and the help topics", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(screen.getByRole("button", { name: "Help" }))
    const items = await screen.findAllByRole("menuitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "Take the tour",
      "Ask the Agent",
      "Help topics",
    ])
  })

  it("starts the tour", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(screen.getByRole("button", { name: "Help" }))
    await user.click(
      await screen.findByRole("menuitem", { name: "Take the tour" })
    )
    await waitFor(async () => expect(await cardTitle()).toBe("What Studio is"))
  })

  it("opens the Agent with the cursor in the message box", async () => {
    const user = userEvent.setup()
    await renderScreen()
    await user.click(screen.getByRole("button", { name: "Help" }))
    await user.click(
      await screen.findByRole("menuitem", { name: "Ask the Agent" })
    )
    await waitFor(() =>
      expect(document.activeElement?.tagName).toBe("TEXTAREA")
    )
  })
})

describe("the Help dialog", () => {
  it("opens from Help with the tour's words, and shows an area", async () => {
    const user = userEvent.setup()
    await renderScreen()
    const dialog = await openTopics(user)

    await user.click(within(dialog).getByRole("button", { name: "The map" }))
    const map = HELP_STEPS.find((step) => step.id === "map")!
    expect(within(dialog).getByText(map.body)).toBeVisible()

    await user.click(within(dialog).getByRole("button", { name: "Show me" }))
    await waitFor(async () => expect(await cardTitle()).toBe("The map"))
    expect(within(await card()).getByText("4 of 10")).toBeVisible()
  })

  it("lists the words", async () => {
    const user = userEvent.setup()
    await renderScreen()
    const dialog = await openTopics(user)
    await user.click(within(dialog).getByRole("button", { name: "Words" }))
    expect(within(dialog).getByText("Claim")).toBeVisible()
    expect(within(dialog).getByText("Unknown")).toBeVisible()
  })

  it("runs the tour from the start", async () => {
    const user = userEvent.setup()
    await renderScreen()
    const dialog = await openTopics(user)
    await user.click(
      within(dialog).getByRole("button", { name: "Take the tour again" })
    )
    await waitFor(async () => expect(await cardTitle()).toBe("What Studio is"))
  })
})
