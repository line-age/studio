import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"

/**
 * What was selected on the map, and the way to ask the Agent about it.
 * Sits at the top centre of the map. Not in Figma yet (the owner asked for it, 2026-11-12).
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
