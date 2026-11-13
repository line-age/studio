import type { ComponentProps, ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * One claim of a section: label, then the cited value or Unknown. Trailing:
 * how many sources cite it, and a purple badge when a proposal is waiting.
 */
export function AttributeRow({
  label,
  value,
  sources = 0,
  proposals = 0,
  selected = false,
  className,
  ...props
}: {
  label: ReactNode
  /** null is Unknown. */
  value: string | null
  sources?: number
  proposals?: number
  selected?: boolean
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-selected={selected || undefined}
      className={cn(
        "flex h-8 cursor-default items-center gap-2 border-b border-border-subtle pr-3 pl-12.5 transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        selected
          ? "border-l-2 border-b-transparent border-l-primary bg-primary-subtle pl-12"
          : "hover:bg-muted",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "w-18 shrink-0 truncate",
          selected ? "type-ui-xs-medium" : "type-ui-xs text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center">
        {value === null ? (
          <StatusLabel status="unknown" size="sm" />
        ) : (
          <span className="truncate type-ui-sm">{value}</span>
        )}
      </span>
      {proposals > 0 && (
        <Badge variant="ai">
          {proposals} {proposals === 1 ? "proposal" : "proposals"}
        </Badge>
      )}
      {sources > 0 && (
        <span className="flex shrink-0 items-center gap-1 type-ui-mono-xs text-muted-foreground">
          <Icon name="source" className="size-3.5" />
          <span className="sr-only">Cited by</span>
          {sources}
          <span className="sr-only">
            {sources === 1 ? "source" : "sources"}
          </span>
        </span>
      )}
    </div>
  )
}
