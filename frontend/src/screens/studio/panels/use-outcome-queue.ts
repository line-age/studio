import { useEffect, useRef, useState } from "react"

import type { OutcomeState, Question } from "@/data/question"

/*
 * What came of a card is sent to the thread as the action `outcome` (plan
 * 2026-11-23-001, D2). The Agent takes one run at a time and refuses a second
 * while one is going, and a press can end while it works (a question sent
 * during the write). So an outcome is held until the Agent is free, sent one
 * at a time in the order made, and kept if the service refuses it, to go when
 * the Agent is next free. Without it a change made in store could lose its
 * record and, after a reload, offer Approve again.
 */

interface Held {
  id: string
  state: OutcomeState
  detail?: string
}

/** The words an outcome is sent with: a press, never shown as a message. */
const WORDS: Record<OutcomeState, string> = {
  done: "Approve",
  declined: "Decline",
  failed: "Approve",
  out_of_date: "Approve",
  dismissed: "Dismiss",
}

/** Hands back `report`: what came of a card, sent as soon as it can be. */
export function useOutcomeQueue(
  agent: {
    working: boolean
    ask: (question: Question, onFailed?: () => void) => unknown
  },
  network: string
): (id: string, state: OutcomeState, detail?: string) => void {
  const queue = useRef<Held[]>([])
  // A change to the queue is a reason to look at it again.
  const [added, setAdded] = useState(0)
  const { working, ask } = agent

  useEffect(() => {
    if (working) return
    const next = queue.current[0]
    if (!next) return
    queue.current = queue.current.slice(1)
    ask(
      {
        words: WORDS[next.state],
        about: [],
        network,
        action: {
          kind: "outcome",
          offer: next.id,
          state: next.state,
          ...(next.detail ? { detail: next.detail } : {}),
        },
      },
      // Refused (a run already going): first in line for the next free turn.
      () => {
        queue.current = [next, ...queue.current]
      }
    )
  }, [working, ask, added, network])

  return (id, state, detail) => {
    queue.current = [
      ...queue.current,
      { id, state, ...(detail ? { detail } : {}) },
    ]
    setAdded((n) => n + 1)
  }
}
