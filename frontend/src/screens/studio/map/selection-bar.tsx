import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { sectionLabel, selectionSize } from "@/data/derive"

import { useAskAgent, useSelectionAttachments } from "../add-to-agent"
import { useHelp } from "../help/help-store"
import { HELP_STEPS } from "../help/steps"
import { useSelectionGroups } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * The SelectionBar for the selection just made, on the map or in the list,
 * until the selection changes. The Help tour shows it too, on the step that
 * explains it.
 */
export function AgentBar() {
  const selected = useStudio((s) => s.selection)
  const bar = useStudio((s) => s.agentBar)
  const touring = useHelp(
    (s) => s.step !== null && HELP_STEPS[s.step].id === "agent"
  )
  const shown =
    (bar !== null && bar === selected) || (touring && selected.size > 0)
  return shown ? <AgentBarShown /> : null
}

function AgentBarShown() {
  const dismiss = useStudio((s) => s.dismissAgentBar)
  const groups = useSelectionGroups()
  const selection = useSelectionAttachments()
  const askAgent = useAskAgent()
  return (
    <SelectionBar
      label={
        // One section goes by its name.
        groups.length === 1 && groups[0].sections.length === 1
          ? sectionLabel(groups[0].sections[0])
          : selectionSize(groups)
      }
      onAsk={() => {
        askAgent(selection)
        dismiss()
      }}
    />
  )
}

/**
 * What was selected, and the way to ask the Agent about it.
 * Sits at the top centre of the map. Figma: SelectionBar, `172:553`.
 */
export function SelectionBar({
  label,
  onAsk,
}: {
  /** "14 sections in 3 pipelines". */
  label: string
  onAsk: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Selection"
      data-tour="ask-agent"
      className="absolute top-3 left-1/2 flex max-w-[calc(100%-9rem)] -translate-x-1/2 items-center gap-2.5 rounded-lg border bg-background py-1 pr-1 pl-2.5 whitespace-nowrap shadow-map-control"
    >
      <span className="truncate type-ui-xs text-muted-foreground" role="status">
        {label}
      </span>
      <Button size="sm" onClick={onAsk}>
        <Icon name="ask" />
        Ask the Agent
      </Button>
    </div>
  )
}
