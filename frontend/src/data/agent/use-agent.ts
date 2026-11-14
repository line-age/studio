import { useEffect, useMemo, useState } from "react"
import { Client } from "@langchain/langgraph-sdk"
import { useStream } from "@langchain/react"

import type { Question } from "../question"
import {
  agentAnswer,
  agentStep,
  type AgentAnswer,
  type AgentStep,
} from "./answer"

/*
 * The conversation with the Agent service, through this app's own /agent path.
 *
 * Studio has no sign-in yet, so every browser opens one shared thread with a
 * fixed id (studio/agent/settings.py). The thread is kept by the service: a
 * reload shows it again, and "Clear chat" deletes it for everyone.
 */

export const SHARED_THREAD_ID = "5d1f0c1e-7a57-4c0d-9e61-a6e17d10a9e7"
const ASSISTANT = "agent"

export interface AgentTurn {
  id: string
  question: Question
  /** The checked answer, or null while it is worked on (or when it was stopped). */
  answer: AgentAnswer | null
  /** The store reads the Agent made for it. */
  tools: string[]
  /** What it did, in plain words, kept on the reply. */
  steps: AgentStep[]
}

interface RawMessage {
  id?: string
  type?: string
  content?: unknown
  additional_kwargs?: Record<string, unknown>
}

/** A message from the thread's saved state: plain, or a serialised LangChain object. */
export function savedMessage(raw: unknown): RawMessage {
  if (raw && typeof raw === "object" && "lc" in raw && "kwargs" in raw) {
    return (raw as { kwargs: RawMessage }).kwargs
  }
  return (raw ?? {}) as RawMessage
}

function apiUrl(): string {
  return `${window.location.origin}/agent`
}

/** Turns from the thread's messages: each question, and the answer that names it. */
export function turnsFrom(messages: readonly RawMessage[]): AgentTurn[] {
  const turns: AgentTurn[] = []
  const byId = new Map<string, AgentTurn>()
  for (const message of messages) {
    const extra = message.additional_kwargs ?? {}
    if (message.type === "human" && message.id) {
      if (byId.has(message.id)) continue
      const question = (extra.question as Question | undefined) ?? {
        words: String(message.content ?? ""),
        about: [],
        network: "",
      }
      const turn: AgentTurn = {
        id: message.id,
        question,
        answer: null,
        tools: [],
        steps: [],
      }
      turns.push(turn)
      byId.set(message.id, turn)
    } else if (message.type === "ai" && typeof extra.answers === "string") {
      const turn = byId.get(extra.answers)
      const parsed = agentAnswer.safeParse(extra.answer)
      // Only an answer the service checked is ever shown.
      if (turn && parsed.success && parsed.data.checked) {
        turn.answer = parsed.data
        turn.tools = Array.isArray(extra.tools) ? (extra.tools as string[]) : []
        const steps = agentStep.array().safeParse(extra.steps)
        turn.steps = steps.success ? steps.data : []
      }
    }
  }
  return turns
}

/** Makes sure the shared thread exists; it must before the stream opens it. */
export function useSharedThread(epoch: number): "ready" | "down" | "starting" {
  const [state, setState] = useState<"ready" | "down" | "starting">("starting")
  useEffect(() => {
    let live = true
    new Client({ apiUrl: apiUrl() }).threads
      .create({ threadId: SHARED_THREAD_ID, ifExists: "do_nothing" })
      .then(() => live && setState("ready"))
      .catch(() => live && setState("down"))
    return () => {
      live = false
    }
  }, [epoch])
  return state
}

export function useAgent() {
  const stream = useStream({
    apiUrl: apiUrl(),
    assistantId: ASSISTANT,
    threadId: SHARED_THREAD_ID,
  })
  // Messages come two ways: `messages`, assembled live from the stream, which
  // has no additional_kwargs for a reply still arriving; and `values.messages`,
  // the thread's saved state, as serialised LangChain objects. The answer
  // travels in additional_kwargs, so the saved copy fills in what the live one
  // lacks.
  const live = stream.messages
  // The stream does not always pass on the state a run ends with, so the
  // thread is read again whenever a run ends (and once on mount).
  const [saved, setSaved] = useState<unknown[]>([])
  const working = stream.isLoading
  useEffect(() => {
    if (working) return
    let current = true
    new Client({ apiUrl: apiUrl() }).threads
      .getState(SHARED_THREAD_ID)
      .then((state) => {
        const values = state.values as { messages?: unknown[] } | null
        if (current) setSaved(values?.messages ?? [])
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [working])
  const turns = useMemo(() => {
    const extras = new Map<string, Record<string, unknown>>()
    const fromSaved = saved.map(savedMessage)
    for (const m of fromSaved) {
      if (m.id && m.additional_kwargs) extras.set(m.id, m.additional_kwargs)
    }
    const fromLive = live.map((m) => ({
      id: m.id,
      type: m.getType(),
      content: m.content,
      additional_kwargs: {
        ...(m.id ? extras.get(m.id) : undefined),
        ...m.additional_kwargs,
      },
    }))
    // Live first, for order; then the saved replies, which carry every answer.
    return turnsFrom([...fromLive, ...fromSaved.filter((m) => m.type === "ai")])
  }, [live, saved])

  /**
   * `onFailed` runs once when the run fails or the service cannot be reached, so the
   * person can send the question again. The SDK may report one failure twice.
   */
  const ask = (question: Question, onFailed?: () => void) => {
    let reported = false
    const failed = () => {
      if (reported) return
      reported = true
      onFailed?.()
    }
    return (
      stream
        .submit(
          {
            messages: [
              {
                type: "human",
                id: crypto.randomUUID(),
                content: question.words,
                additional_kwargs: { question },
              },
            ],
          } as never,
          { multitaskStrategy: "reject", onError: failed }
        )
        // "reject" throws when a run is already in flight.
        .catch(failed)
    )
  }

  const stop = () => stream.stop({ cancel: true })

  const clear = async () => {
    if (stream.isLoading) await stop().catch(() => undefined)
    const client = new Client({ apiUrl: apiUrl() })
    await client.threads.delete(SHARED_THREAD_ID).catch(() => undefined)
    await client.threads.create({
      threadId: SHARED_THREAD_ID,
      ifExists: "do_nothing",
    })
  }

  // What the Agent is doing now: the graph keeps it in its state ("steps"),
  // which arrives on the values stream as each node finishes.
  // Until the new run's first node clears it, the state still holds the last
  // answer (and its finished steps): only a cleared state is this run's.
  const values = stream.values as
    { steps?: unknown; answers?: string | null } | undefined
  const nowDoing = agentStep
    .array()
    .safeParse(values?.answers == null ? values?.steps : [])

  return {
    turns,
    liveSteps: working && nowDoing.success ? nowDoing.data : [],
    ask,
    stop,
    clear,
    working: stream.isLoading,
    error: stream.error ? String(stream.error) : null,
  }
}
