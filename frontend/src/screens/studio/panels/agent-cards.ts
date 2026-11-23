import { createContext } from "react"

import type { AgentStatement, AgentStep } from "@/data/agent/answer"
import type { AgentTurn } from "@/data/agent/use-agent"
import type { OutcomeState, Question } from "@/data/question"

/*
 * What became of each card in the chat, read from the thread (plan
 * 2026-11-23-001, D2). A press is an action turn the service records: an
 * outcome (a change made, declined, failed, out of date; a search not run; a
 * finding dismissed) or a search. The thread is shared and kept, so a card
 * shows the same state for everyone and after a reload. Action turns are not
 * drawn as messages: their cards say what came of them.
 */

/** An outcome, as the person's press reported it. */
export interface CardOutcome {
  state: OutcomeState
  detail?: string
}

/** A search a person started, as its turn shows it. */
export type SearchRun =
  | { state: "searching"; steps: readonly string[] }
  | { state: "done"; statements: readonly AgentStatement[] }
  | { state: "stopped" }
  | { state: "refused"; text: string }

/** Every recorded outcome by card id (an offer's id, or a finding's handle). */
export function outcomesIn(
  turns: readonly AgentTurn[]
): ReadonlyMap<string, CardOutcome> {
  const out = new Map<string, CardOutcome>()
  for (const turn of turns) {
    const action = turn.question.action
    if (action?.kind !== "outcome" || !action.offer || !action.state) continue
    out.set(action.offer, {
      state: action.state,
      ...(action.detail ? { detail: action.detail } : {}),
    })
  }
  return out
}

/** A search's own lines and what it found, without the line that started it. */
function searchStatements(turn: AgentTurn): AgentStatement[] {
  return (turn.answer?.statements ?? []).filter(
    (s) => !(s.kind === "citation_request" && s.request)
  )
}

/**
 * Every search a person started, by offer id. The last turn, while the
 * Agent works, is searching; a search turn whose answer has nothing from
 * cite after it was stopped.
 */
export function searchesIn(
  turns: readonly AgentTurn[],
  working: boolean,
  liveSteps: readonly AgentStep[]
): ReadonlyMap<string, SearchRun> {
  const out = new Map<string, SearchRun>()
  turns.forEach((turn, i) => {
    const action = turn.question.action
    if (action?.kind !== "search" || !action.offer) return
    const last = i === turns.length - 1
    const statements = turn.answer?.statements ?? []
    const started = statements.some(
      (s) => s.kind === "citation_request" && s.request
    )
    const after = searchStatements(turn)
    if (last && working) {
      out.set(action.offer, {
        state: "searching",
        steps: liveSteps.filter((s) => s.by === "cite").map((s) => s.text),
      })
    } else if (!started && statements.length > 0) {
      out.set(action.offer, { state: "refused", text: statements[0].text })
    } else if (after.length === 0) {
      out.set(action.offer, { state: "stopped" })
    } else {
      out.set(action.offer, { state: "done", statements: after })
    }
  })
  return out
}

/** Whether a turn is a press, drawn on its card and not as a message. */
export function isPress(turn: AgentTurn): boolean {
  const kind = turn.question.action?.kind
  return kind === "outcome" || kind === "propose" || kind === "search"
}

/** The statements of a search turn the thread shows under its card. */
export function shownOfSearch(turn: AgentTurn): AgentStatement[] {
  return searchStatements(turn)
}

/** What a card can do, from the conversation. Null while it cannot. */
export interface AgentCardsValue {
  outcome: (id: string) => CardOutcome | undefined
  search: (id: string) => SearchRun | undefined
  /** Report what came of a card; null while the Agent is busy. */
  report:
    ((id: string, state: OutcomeState, detail?: string) => Promise<void>) | null
  /** Start a search an offer holds; null while the Agent is busy. */
  start: ((id: string) => void) | null
  /** Stop the search going on. */
  stop: () => void
  /** Ask a question again: the card's own, for Ask again. */
  ask: ((question: Question) => void) | null
  /** Put words in the message box for the person to finish. */
  draft: (words: string) => void
}

export const AgentCards = createContext<AgentCardsValue>({
  outcome: () => undefined,
  search: () => undefined,
  report: null,
  start: null,
  stop: () => undefined,
  ask: null,
  draft: () => undefined,
})

/** The question a card's answer is the answer to, for Ask again. */
export const CardQuestion = createContext<Question | null>(null)
