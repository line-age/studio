import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseNetwork } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

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
        text: "Alder to Birch is first shown on the 1932 map.",
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

const grouped = structuredClone(turn.answer.statements)
const about = structuredClone(turn.question.about)

beforeEach(() => {
  turn.answer.statements = structuredClone(grouped)
  turn.question.about = structuredClone(about)
  delete (turn.answer as { carried?: unknown }).carried
  Element.prototype.scrollTo = () => undefined
  localStorage.clear()
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
      within(answer).getByRole("button", { name: /Read 3 things/ })
    ).toBeInTheDocument()
    expect(
      within(answer).getByRole("region", { name: "Alder to Birch" })
    ).toHaveTextContent("Inferred · Alder to Birch is first shown")
    expect(
      within(answer).getByRole("region", { name: "Birch to Cedar" })
    ).toHaveTextContent("Example Gazette, p. 41")
    // s-3 has no statement: listed after, and it opens.
    expect(answer).toHaveTextContent("1 more section is not in this answer.")
    await userEvent.click(
      within(answer).getByRole("button", { name: "Dale to Elm" })
    )
    expect(useStudio.getState().selection).toContain("s-3")
  })
})

describe("a line saying what the Agent cannot do yet", () => {
  it("stands alone, never grouped under the sections attached", async () => {
    turn.answer.statements = [
      {
        kind: "not_yet",
        text: "I cannot say who traced a section yet. The list's Traced by filter shows it.",
        refs: [],
      },
    ]
    await act(async () => {
      render(<StudioScreen />)
    })
    await userEvent.click(screen.getByRole("button", { name: /^Agent/ }))
    const answer = screen.getByRole("article", { name: "The Agent's answer" })
    // A fixed line is a notice: what happened, then what it means.
    expect(
      within(answer).getByText("I cannot say who traced a section yet.")
    ).toBeVisible()
    expect(
      within(answer).getByText("The list's Traced by filter shows it.")
    ).toBeVisible()
    expect(within(answer).queryByRole("region")).not.toBeInTheDocument()
    expect(answer).not.toHaveTextContent("not in this answer")
  })
})

describe("a source under a statement", () => {
  it("opens its citation in the citation pop-up at once", async () => {
    turn.answer.statements = [
      {
        kind: "fact",
        text: "Its traced line comes from the 1931 edition.",
        refs: [
          {
            type: "claim",
            id: "c-2",
            feature_id: "s-6",
            attribute: "route",
            status: "accepted",
            source: "Example Gazette, p. 41",
          },
        ],
      },
    ]
    await act(async () => {
      render(<StudioScreen />)
    })
    await userEvent.click(screen.getByRole("button", { name: /^Agent/ }))
    await userEvent.click(
      screen.getByRole("button", {
        name: "Open the citation, from Example Gazette, p. 41",
      })
    )
    expect(useStudio.getState().openedCitation).toMatchObject({
      sectionId: "s-6",
      attribute: "Geometry",
    })
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    // The screen behind is left as it was: nothing selected, no claim opened.
    expect(useStudio.getState().selection.size).toBe(0)
  })
})

describe("an answer to a follow-up", () => {
  it("says which section of the last question it is about, and opens it", async () => {
    turn.question.about = []
    Object.assign(turn.answer, {
      carried: [{ type: "feature", id: "s-1", label: "Alder to Birch" }],
      statements: [
        {
          kind: "worked_out",
          text: "It is about 76 km long as drawn.",
          refs: [{ type: "feature", id: "s-1", label: "Alder to Birch" }],
        },
      ],
    })
    await act(async () => {
      render(<StudioScreen />)
    })
    await userEvent.click(screen.getByRole("button", { name: /^Agent/ }))
    const answer = screen.getByRole("article", { name: "The Agent's answer" })
    expect(answer).toHaveTextContent(
      "About Alder to Birch, from your last question."
    )
    // The one thing it is about is "it": named once, in that line.
    expect(
      within(answer).getAllByRole("button", { name: "Alder to Birch" })
    ).toHaveLength(1)
    await userEvent.click(
      within(answer).getByRole("button", { name: "Alder to Birch" })
    )
    expect(useStudio.getState().selection).toContain("s-1")
  })
})
