import type { CSSProperties } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"

/**
 * What a lasso caught, and the way to ask the Agent about it. Floats by the
 * end of the loop. Not in Figma yet (the owner asked for it, 2026-11-12).
 */
export function SelectionBar({
  label,
  onAsk,
  style,
}: {
  /** "14 sections in 3 pipelines". */
  label: string
  onAsk: () => void
  style?: CSSProperties
}) {
  return (
    <div
      role="group"
      aria-label="Selection"
      style={style}
      className="absolute flex items-center gap-2.5 rounded-lg border bg-background py-1 pr-1 pl-2.5 whitespace-nowrap shadow-map-control"
    >
      <span className="type-ui-xs text-muted-foreground" role="status">
        {label}
      </span>
      <Button size="sm" onClick={onAsk}>
        <Icon name="ask" />
        Ask the Agent
      </Button>
    </div>
  )
}
