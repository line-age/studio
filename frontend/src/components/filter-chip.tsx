import type { ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * One filter in force, with a button that takes it off. Not in Figma yet
 * (the owner asked for removable badges, 2026-11-12).
 */
export function FilterChip({
  children,
  hint,
  removeLabel,
  onRemove,
}: {
  children: ReactNode
  /** What the filter does to the list, shown as a tooltip on the label. */
  hint?: string
  /** What the button does, in words: "Remove the company filter". */
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <Badge variant="secondary" className="max-w-full gap-0.5 pr-0.5">
      {hint ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            {children}
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {hint}
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="truncate">{children}</span>
      )}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid"
      >
        <Icon name="close" className="size-2.5" />
      </button>
    </Badge>
  )
}
