import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Head of a group inside a list, with a count. Not interactive. */
export function ListGroupHeader({
  children,
  count,
  className,
  id,
}: {
  children: ReactNode
  count?: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex h-7 shrink-0 items-center justify-between border-b border-border-subtle bg-muted px-3 type-ui-xs-medium text-muted-foreground",
        className
      )}
    >
      <span>{children}</span>
      {count !== undefined && <span className="type-ui-mono-xs">{count}</span>}
    </div>
  )
}
