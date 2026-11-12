import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * A quiet line in the conversation: a date separator, or a status such as
 * what the Agent read. Not interactive.
 */
export function Marker({
  children,
  separator = false,
  className,
}: {
  children: ReactNode
  separator?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 type-ui-sm text-muted-foreground",
        separator && "justify-center",
        className
      )}
    >
      {separator && (
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      )}
      <span>{children}</span>
      {separator && (
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      )}
    </div>
  )
}
