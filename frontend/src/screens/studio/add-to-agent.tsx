import { useRef, type ReactElement } from "react"

import { Icon } from "@/components/icons/icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { AgentRef } from "@/data/question"

import { useLeftPanel } from "./left-panel-context"
import { useSelectionGroups } from "./studio-data"
import { useStudio, type AgentAttachment } from "./studio-store"

/** What is selected now, as attachments: one per pipeline touched. */
export function useSelectionAttachments(): AgentAttachment[] {
  return useSelectionGroups().map((group) => ({
    pipelineId: group.summary.id,
    sectionIds: group.whole ? "all" : group.sections.map((s) => s.id),
  }))
}

/**
 * Hands `items` to the Agent: attaches them to the next question, opens the
 * Agent panel and puts the cursor in the message box.
 */
export function useAskAgent(): (
  items: AgentAttachment[],
  more?: { refs?: readonly AgentRef[]; words?: string }
) => void {
  const ask = useStudio((s) => s.askAgent)
  const { openPanel } = useLeftPanel()
  return (items, more) => {
    ask(items, more)
    openPanel("agent")
  }
}

/**
 * A question that only reads, offered in a menu: its words, and what it
 * attaches when that is not the menu's own thing (a proposal on a claim).
 */
export interface Starter {
  words: string
  refs?: readonly AgentRef[]
}

/**
 * Right click on `children` offers to attach `items` to the next question
 * for the Agent, and opens the Agent panel. The menu is stock shadcn: it is
 * not in Figma yet (the owner asked for it on 2026-11-12). With nothing to
 * offer it does not open at all: a menu whose one item is off says nothing.
 * It stays mounted, switched off, so what it wraps (the map) is not rebuilt.
 */
export function AddToAgentMenu({
  items = [],
  refs = [],
  starters = [],
  children,
}: {
  /** Sections, by the pipeline or group they are in. */
  items?: AgentAttachment[]
  /** Finer things: a claim, a source, a proposal. */
  refs?: readonly AgentRef[]
  /**
   * Questions that only read, above "Add to the Agent chat". Each attaches
   * the same things and puts its words in the message box.
   */
  starters?: readonly Starter[]
  children: ReactElement
}) {
  const askAgent = useAskAgent()
  // Choosing an item hands the cursor to the chat; the menu must not take it
  // back to the row. Dismissed without a choice, it returns as usual.
  const chosen = useRef(false)
  const ask: typeof askAgent = (items, more) => {
    chosen.current = true
    askAgent(items, more)
  }
  const empty =
    items.length === 0 &&
    refs.length === 0 &&
    starters.every((starter) => !starter.refs?.length)
  return (
    <ContextMenu
      disabled={empty}
      onOpenChange={(open) => {
        if (open) chosen.current = false
      }}
    >
      <ContextMenuTrigger render={children} />
      <ContextMenuContent finalFocus={() => !chosen.current}>
        {starters.map((starter) => (
          <ContextMenuItem
            key={starter.words}
            onClick={() =>
              ask(items, {
                refs: starter.refs ?? refs,
                words: starter.words,
              })
            }
          >
            <Icon name="ask" />
            {starter.words}
          </ContextMenuItem>
        ))}
        {starters.length > 0 && <ContextMenuSeparator />}
        <ContextMenuItem onClick={() => ask(items, { refs })}>
          <Icon name="ask" />
          Add to the Agent chat
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
