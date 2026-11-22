import { useRef, type ReactElement } from "react"

import { Icon } from "@/components/icons/icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { AgentRef } from "@/data/question"

import { useLeftPanel } from "./left-panel-context"
import type { MenuChange } from "./pipeline-actions"
import { useSelectionGroups } from "./studio-data"
import { useStudio, type AgentAttachment } from "./studio-store"

/** What is selected now, as attachments: one per pipeline touched. */
export function useSelectionAttachments(): AgentAttachment[] {
  return useSelectionGroups().map((group) => ({
    pipelineId: group.summary.id,
    // A whole pipeline is "all" of it. A group (an edition, no pipeline) is
    // only a way of listing: it goes as its sections, which still mean the
    // same after the list is grouped another way.
    sectionIds:
      group.whole && !group.summary.unassigned
        ? "all"
        : group.sections.map((s) => s.id),
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
 * Right click on `children` offers to attach `items` to the next question
 * for the Agent, and opens the Agent panel. The menu is stock shadcn: it is
 * not in Figma yet (the owner asked for it on 2026-11-12). With nothing to
 * offer it does not open at all: a menu whose one item is off says nothing.
 * It stays mounted, switched off, so what it wraps (the map) is not rebuilt.
 */

/**
 * What a right-click on a section offers to edit: "Edit" acts on just the
 * row clicked. A second "Edit selected (N)" item, naming how many
 * `onEditAll` reaches, only appears when the row is ticked as part of a
 * larger selection, so a click never silently changes more than it says.
 * On the map there is no row clicked: one section selected is "Edit",
 * several are "Edit selected (N)" alone.
 */
export interface EditTarget {
  /** The clicked row's own name, for the muted header above "Edit". */
  name: string
  /** Edit the row alone. Left out where there is no row (the map). */
  onEditOne?: () => void
  /** How many sections are selected; 1 hides the bulk item entirely. */
  count: number
  onEditAll: () => void
}

export function AddToAgentMenu({
  items = [],
  refs = [],
  changes = [],
  edit,
  onOpenChange,
  children,
}: {
  /**
   * Changes, each opening a modal (Move to a pipeline, Make pipeline, Edit
   * pipeline), under the Edit items. Only where a change can be made.
   */
  changes?: readonly MenuChange[]
  /** Sections, by the pipeline or group they are in. */
  items?: AgentAttachment[]
  /** Finer things: a claim, a source, a proposal. */
  refs?: readonly AgentRef[]
  /**
   * Puts "Edit …" first, with a muted line at the top naming how many when
   * several: a section's own Edit window, or a pipeline's.
   */
  edit?: EditTarget
  /** So the row(s) this menu acts on can be highlighted while it is open. */
  onOpenChange?: (open: boolean) => void
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
    changes.length === 0 && !edit && items.length === 0 && refs.length === 0
  return (
    <ContextMenu
      disabled={empty}
      onOpenChange={(open) => {
        if (open) chosen.current = false
        onOpenChange?.(open)
      }}
    >
      <ContextMenuTrigger render={children} />
      <ContextMenuContent finalFocus={() => !chosen.current}>
        {edit && (
          <ContextMenuGroup>
            {edit.count > 1 && (
              <ContextMenuLabel>{`${edit.count} sections selected`}</ContextMenuLabel>
            )}
            {edit.onEditOne && (
              <ContextMenuItem onClick={edit.onEditOne}>Edit</ContextMenuItem>
            )}
            {edit.count > 1 && (
              <ContextMenuItem onClick={edit.onEditAll}>
                {`Edit selected (${edit.count})`}
              </ContextMenuItem>
            )}
          </ContextMenuGroup>
        )}
        {changes.map((item) => (
          <ContextMenuItem key={item.label} onClick={item.onSelect}>
            {item.label}
          </ContextMenuItem>
        ))}
        {(edit || changes.length > 0) && <ContextMenuSeparator />}
        <ContextMenuItem onClick={() => ask(items, { refs })}>
          <Icon name="ask" />
          Ask
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
