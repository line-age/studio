import type { ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * The one mark for Unknown: the orange word with a dotted underline. Cited is
 * green with a tick. The word is always there; colour never stands alone.
 */
export function StatusLabel({
  status,
  size = "xs",
  children,
  className,
}: {
  status: "unknown" | "cited"
  size?: "xs" | "sm"
  /** Defaults to "Unknown" or "All cited". Pass a count in words: "4 Unknown". */
  children?: ReactNode
  className?: string
}) {
  const type = size === "sm" ? "type-ui-sm" : "type-ui-xs-medium"
  if (status === "unknown") {
    return (
      <span
        className={cn(
          "inline-flex items-center border-b border-dotted border-state-unknown-foreground pb-px whitespace-nowrap text-state-unknown-foreground",
          type,
          className
        )}
      >
        {children ?? "Unknown"}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-state-cited-foreground",
        type,
        className
      )}
    >
      <Icon name="check" className="size-3" />
      {children ?? "All cited"}
    </span>
  )
}
