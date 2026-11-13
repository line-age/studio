import type { ComponentProps, ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * One section in the tree on the right. Open it to list its claims as
 * AttributeRows. The right side shows how many claims are cited, or the
 * Unknown count in words.
 */
export function TreeItem({
  name,
  code,
  trailing,
  expanded,
  selected = false,
  checked = selected,
  onToggle,
  onCheck,
  checkLabel,
  className,
  ...props
}: {
  name: ReactNode
  code: ReactNode
  trailing: ReactNode
  expanded: boolean
  /** The row in focus, drawn with the selected background. */
  selected?: boolean
  /** Ticked: part of the selection. Several rows can be. */
  checked?: boolean
  onToggle: () => void
  /** Makes the box clickable on its own. */
  onCheck?: () => void
  /** Accessible name of the box, for example "Select Ash to Birch". */
  checkLabel?: string
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex h-9 cursor-default items-center gap-2 border-b border-border-subtle px-3 transition-colors duration-100 select-none [contain-intrinsic-size:auto_36px] [content-visibility:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        selected ? "bg-selected" : "hover:bg-muted",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        className="-m-1 flex p-1 text-muted-foreground"
      >
        <Icon
          name={expanded ? "chevron-down" : "chevron-right"}
          className="size-3.5"
        />
      </span>
      <CheckMark
        value={checked ? "checked" : "unchecked"}
        label={checkLabel}
        onChange={onCheck}
      />
      <span
        // A name cut short can still be read in full.
        title={typeof name === "string" ? name : undefined}
        className="truncate type-ui-sm"
      >
        {name}
      </span>
      <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
        {code}
      </span>
      {/* Progress reads as it does in the list: "2/3 cited". */}
      <span className="ml-auto flex shrink-0 items-center type-ui-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {trailing}
      </span>
    </div>
  )
}
