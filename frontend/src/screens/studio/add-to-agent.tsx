import type { ReactElement } from "react"

import { Icon } from "@/components/icons/icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { useLeftPanel } from "./left-panel-context"
import { useStudio, type AgentAttachment } from "./studio-store"

/** What is selected now, as things that can be attached to a question. */
export function useSelectionAttachments(): AgentAttachment[] {
  const pipelineId = useStudio((s) => s.selectedPipelineId)
  const checked = useStudio((s) => s.checkedSectionIds)
  if (!pipelineId) return []
  // null means the whole pipeline is selected.
  if (checked === null) return [{ kind: "pipeline", id: pipelineId }]
  return [...checked].map((id) => ({ kind: "section", id }))
}

/**
 * Right click on `children` offers to attach `items` to the next question
 * for the Agent, and opens the Agent panel. The menu is stock shadcn: it is
 * not in Figma yet (the owner asked for it on 2026-11-12).
 */
export function AddToAgentMenu({
  items,
  children,
}: {
  items: AgentAttachment[]
  children: ReactElement
}) {
  const attach = useStudio((s) => s.attachToAgent)
  const { openPanel } = useLeftPanel()
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuItem
          disabled={items.length === 0}
          onClick={() => {
            attach(items)
            openPanel("agent")
          }}
        >
          <Icon name="ask" />
          Add to the Agent chat
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
