import type { ComponentProps, ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * One pipeline in the left list, or one group of sections that are in no
 * pipeline. A flush row with a divider. The right side leads with the status
 * in words, then how far the sections have come.
 */
export function PipelineRow({
  name,
  meta,
  status,
  progress,
  expanded,
  onToggle,
  toggleLabel,
  selected = false,
  checked = selected ? "checked" : "unchecked",
  onCheck,
  checkLabel,
  className,
  ...props
}: {
  name: ReactNode
  /** Code and section count: "P-012 · 6 sections". */
  meta: ReactNode
  /** A StatusBadge. */
  status: ReactNode
  /** "4 of 6 done". */
  progress: ReactNode
  /** With `onToggle`: whether the rows under this one are showing. */
  expanded?: boolean
  /** Adds a chevron that shows or hides the rows under this one. */
  onToggle?: () => void
  /** Accessible name of the chevron, needed with `onToggle`. */
  toggleLabel?: string
  selected?: boolean
  /** How much of the pipeline is selected. Defaults to follow `selected`. */
  checked?: "unchecked" | "checked" | "indeterminate"
  /** Makes the box a real checkbox that adds or removes this pipeline. */
  onCheck?: () => void
  /** Accessible name of the box, needed with `onCheck`. */
  checkLabel?: string
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex cursor-default items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 transition-colors duration-100 select-none [contain-intrinsic-size:auto_59px] [content-visibility:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        selected
          ? "bg-selected hover:bg-selected-hover"
          : "hover:bg-muted active:bg-accent",
        className
      )}
      {...props}
    >
      <CheckMark value={checked} label={checkLabel} onChange={onCheck} />
      {onToggle && (
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="-mx-1 flex size-5 shrink-0 cursor-default items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid"
        >
          <Icon
            name="chevron-right"
            className={cn(
              "size-3.5 transition-transform duration-100",
              expanded && "rotate-90"
            )}
          />
        </button>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate type-ui-sm-medium">{name}</span>
        <span className="truncate type-ui-xs text-muted-foreground">
          {meta}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {status}
        <span className="type-ui-xs text-muted-foreground tabular-nums">
          {progress}
        </span>
      </span>
    </div>
  )
}
