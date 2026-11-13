import type { ReactNode } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * Head of a side panel: optional icon, title, a quiet count or id, then
 * whatever the panel needs on the right (one action, or summary badges).
 */
export function PanelHeader({
  title,
  meta,
  icon,
  leading,
  divider = false,
  children,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  icon?: IconName
  /** A control before the title, such as a way back. */
  leading?: ReactNode
  divider?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex h-panel-header shrink-0 items-center justify-between gap-2 pr-2 pl-3",
        divider && "border-b",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        {icon && <Icon name={icon} />}
        <h2 className="truncate type-ui-sm-semibold">{title}</h2>
        {meta && (
          <span className="shrink-0 type-ui-xs text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      )}
    </header>
  )
}
