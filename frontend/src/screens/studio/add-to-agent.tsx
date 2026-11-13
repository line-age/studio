import type { ReactElement } from "react"

import { Icon } from "@/components/icons/icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

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
export function useAskAgent(): (items: AgentAttachment[]) => void {
  const ask = useStudio((s) => s.askAgent)
  const { openPanel } = useLeftPanel()
  return (items) => {
    ask(items)
    openPanel("agent")
  }
}

/**
 * Right click on `children` offers to attach `items` to the next question
 * for the Agent, and opens the Agent panel. The menu is stock shadcn: it is
 * not in Figma yet (the owner asked for it on 2026-11-12). With nothing to
 * offer it does not open at all: a menu whose one item is off says nothing.
 * It stays mounted, switched off, so what it wraps (the map) is not rebuilt.
 */
export function AddToAgentMenu({
  items,
  children,
}: {
  items: AgentAttachment[]
  children: ReactElement
}) {
  const askAgent = useAskAgent()
  return (
    <ContextMenu disabled={items.length === 0}>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => askAgent(items)}>
          <Icon name="ask" />
          Add to the Agent chat
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
