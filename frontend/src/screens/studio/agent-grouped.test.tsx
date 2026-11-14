import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseNetwork } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * An answer about several sections (Figma section 13, frame B): its statements
 * grouped under each section, the store reads folded above, the sections it
 * did not go into listed after, each opening on its own. Invented data.
 */

const turn = vi.hoisted(() => ({
  id: "q1",
  question: {
    words: "What do we know about these sections?",
    about: ["s-1", "s-2", "s-3"].map((id) => ({ kind: "section", id })),
    network: "gas",
  },
  tools: ["read_feature"],
  steps: [
    { text: "Read 3 sections", done: true },
    { text: "Checking the answer", done: true },
  ],
  answer: {
    version: 1,
    checked: true,
    statements: [
      {
        kind: "worked_out",
        text: "Alder to Birch is first traced on the 1932 printing.",
        refs: [{ type: "feature", id: "s-1", label: "Alder to Birch" }],
      },
      {
        kind: "fact",
        text: "The owner is Example Gas Co., by 1932.",
        refs: [
          {
            type: "claim",
            id: "c-9",
            feature_id: "s-2",
            attribute: "owner",
            status: "accepted",
            source: "Example Gazette, p. 41",
          },
        ],
      },
    ],
  },
}))

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  dataSource: () => "store",
  loadNetwork: () => Promise.resolve(parseNetwork(evidenceNetwork())),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))
vi.mock("@/data/agent/use-agent", () => ({
  useSharedThread: () => "ready",
  useAgent: () => ({
    turns: [turn],
    liveSteps: [],
    ask: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    working: false,
    error: null,
  }),
}))

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("an answer about several sections", () => {
  it("groups statements by section, folds the reads, and lists the rest", async () => {
    await act(async () => {
      render(<StudioScreen />)
    })
    await userEvent.click(screen.getByRole("button", { name: /^Agent/ }))
    const answer = screen.getByRole("article", { name: "The Agent's answer" })
    expect(
      within(answer).getByRole("button", { name: /Read 3 things in store/ })
    ).toBeInTheDocument()
    expect(
      within(answer).getByRole("region", { name: "Alder to Birch" })
    ).toHaveTextContent("Worked out · Alder to Birch is first traced")
    expect(
      within(answer).getByRole("region", { name: "Birch to Cedar" })
    ).toHaveTextContent("Example Gazette, p. 41")
    // s-3 has no statement: listed after, and it opens.
    expect(answer).toHaveTextContent("1 more section.")
    await userEvent.click(
      within(answer).getByRole("button", { name: "Dale to Elm" })
    )
    expect(useStudio.getState().selection).toContain("s-3")
  })
})
