import type { ReactNode } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** The section and fact a question is about, attached to the message. */
export function Attachment({
  title,
  meta,
  icon = "section",
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  icon?: IconName
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl border bg-card py-1.5 pr-2.5 pl-1.5",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-ui-xs-medium">{title}</span>
        {meta && (
          <span className="truncate type-ui-xs text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
    </div>
  )
}
