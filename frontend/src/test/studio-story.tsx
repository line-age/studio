import type { Decorator } from "@storybook/react-vite"
import { Suspense, useState } from "react"

import type { Network } from "@/data/schema"
import {
  AgentCards,
  type AgentCardsValue,
  type CardOutcome,
  type SearchRun,
} from "@/screens/studio/panels/agent-cards"
import { StudioDataProvider } from "@/screens/studio/studio-data"

import { testNetwork } from "./network"

/** The spies a story of a chat card passes, and what the thread holds. */
export interface CardStoryArgs {
  onReport: (id: string, state: string, detail?: string) => void
  onStart: (id: string) => void
  onStop: () => void
  onAsk: (words: string) => void
  onDraft: (words: string) => void
  /** What the thread holds for the card, as another person's press left it. */
  outcome?: CardOutcome
  run?: SearchRun
  /** The Agent is working: nothing can be pressed. */
  busy?: boolean
}

/**
 * Holds a chat card's story in Studio's data, on the invented test network,
 * with the card context built from the story's spies, so a play function can
 * check what a press sent. Changes are made in memory, as on the sample.
 */
export function inStudio(network: () => Network = testNetwork): Decorator {
  return function InStudio(Story, { args }) {
    const a = args as unknown as CardStoryArgs
    const [loaded] = useState(() => Promise.resolve(network()))
    const cards: AgentCardsValue = {
      outcome: () => a.outcome,
      search: () => a.run,
      report: a.busy
        ? null
        : async (id, state, detail) => a.onReport(id, state, detail),
      start: a.busy ? null : (id) => a.onStart(id),
      stop: () => a.onStop(),
      ask: a.busy ? null : (question) => a.onAsk(question.words),
      draft: (words) => a.onDraft(words),
    }
    return (
      <Suspense fallback={null}>
        <StudioDataProvider network={loaded} source="fixture">
          <AgentCards value={cards}>
            <div className="w-104">
              <Story />
            </div>
          </AgentCards>
        </StudioDataProvider>
      </Suspense>
    )
  }
}
