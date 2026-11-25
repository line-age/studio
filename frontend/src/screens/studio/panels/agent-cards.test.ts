import { describe, expect, it } from "vitest"

import type { AgentStatement } from "@/data/agent/answer"
import type { AgentTurn } from "@/data/agent/use-agent"
import type { QuestionAction } from "@/data/question"

import { isPress, outcomesIn, searchesIn, shownOfSearch } from "./agent-cards"

/* What became of each card, read from the thread's turns. Invented. */

let n = 0
function turn(
  action?: QuestionAction,
  statements?: AgentStatement[]
): AgentTurn {
  n += 1
  return {
    id: `t${n}`,
    question: {
      words: "w",
      about: [],
      network: "gas",
      ...(action ? { action } : {}),
    },
    answer: statements
      ? { version: 2, checked: true, statements, carried: [] }
      : null,
    tools: [],
    steps: [],
  }
}

const started: AgentStatement = {
  kind: "citation_request",
  text: "Searching our sources",
  refs: [],
  request: {
    feature_id: "s",
    attribute_keys: ["owner"],
    priority: "interactive",
    hints: [],
  },
}
const finding: AgentStatement = { kind: "finding", text: "Found", refs: [] }

describe("outcomesIn", () => {
  it("keeps the last outcome of each card, with its words", () => {
    const outcomes = outcomesIn([
      turn({ kind: "outcome", offer: "a", state: "failed", detail: "No." }),
      turn({ kind: "outcome", offer: "a", state: "done", detail: "Yes." }),
      turn({ kind: "outcome", offer: "F1", state: "dismissed" }),
      turn(),
      turn({ kind: "outcome", offer: "b" }),
    ])
    expect(outcomes.get("a")).toEqual({ state: "done", detail: "Yes." })
    expect(outcomes.get("F1")).toEqual({ state: "dismissed" })
    expect(outcomes.has("b")).toBe(false)
  })
})

describe("searchesIn", () => {
  it("is searching while its turn is the last and the Agent works, with cite's steps", () => {
    const runs = searchesIn([turn({ kind: "search", offer: "s1" })], true, [
      { text: "Reading the data", done: true },
      { text: "Reading page 3", done: false, by: "cite" },
    ])
    expect(runs.get("s1")).toEqual({
      state: "searching",
      steps: ["Reading page 3"],
    })
  })

  it("is done with what it found, without the line that started it", () => {
    const runs = searchesIn(
      [turn({ kind: "search", offer: "s1" }, [started, finding])],
      false,
      []
    )
    expect(runs.get("s1")).toEqual({ state: "done", statements: [finding] })
  })

  it("was stopped when nothing came back after it started", () => {
    const runs = searchesIn(
      [turn({ kind: "search", offer: "s1" }, [started])],
      false,
      []
    )
    expect(runs.get("s1")).toEqual({ state: "stopped" })
  })

  it("was refused when it never started, in the Agent's words", () => {
    const refusal: AgentStatement = {
      kind: "refusal",
      text: "A search is already running.",
      refs: [],
    }
    const runs = searchesIn(
      [turn({ kind: "search", offer: "s1" }, [refusal])],
      false,
      []
    )
    expect(runs.get("s1")).toEqual({
      state: "refused",
      text: "A search is already running.",
    })
  })

  it("ignores every turn that is not a search", () => {
    expect(
      searchesIn([turn(), turn({ kind: "propose", finding: "F1" })], false, [])
        .size
    ).toBe(0)
  })
})

describe("a press is drawn on its card", () => {
  it("is not a message: an outcome, a Propose, a Search", () => {
    expect(isPress(turn({ kind: "outcome", offer: "a", state: "done" }))).toBe(
      true
    )
    expect(isPress(turn({ kind: "propose", finding: "F1" }))).toBe(true)
    expect(isPress(turn({ kind: "search", offer: "s1" }))).toBe(true)
    expect(isPress(turn())).toBe(false)
  })

  it("shows what a search found under its card", () => {
    expect(
      shownOfSearch(turn({ kind: "search", offer: "s1" }, [started, finding]))
    ).toEqual([finding])
  })
})

describe("found in review", () => {
  it("shows nothing under the card of a search that never started: the card says why", () => {
    const refusal: AgentStatement = {
      kind: "refusal",
      text: "A search is already running.",
      refs: [],
    }
    expect(
      shownOfSearch(turn({ kind: "search", offer: "s1" }, [refusal]))
    ).toEqual([])
  })
})
