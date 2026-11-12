import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Quiet summary line at the foot of a panel. */
export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <footer
      className={cn(
        "flex h-10 shrink-0 items-center border-t px-3 type-ui-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </footer>
  )
}
