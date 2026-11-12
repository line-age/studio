import type { ComponentProps, ReactNode } from "react"

import { CheckMark } from "@/components/check-mark"
import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * One section in the tree on the right. Open it to list its facts as
 * AttributeRows. The right side shows how many facts are cited, or the
 * Unknown count in words.
 */
export function TreeItem({
  name,
  code,
  trailing,
  expanded,
  selected = false,
  onToggle,
  className,
  ...props
}: {
  name: ReactNode
  code: ReactNode
  trailing: ReactNode
  expanded: boolean
  selected?: boolean
  onToggle: () => void
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
      <CheckMark value={selected ? "checked" : "unchecked"} />
      <span className="truncate type-ui-sm">{name}</span>
      <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
        {code}
      </span>
      <span className="ml-auto flex shrink-0 items-center type-ui-mono-xs">
        {trailing}
      </span>
    </div>
  )
}
