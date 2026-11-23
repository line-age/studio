import type { ComponentProps } from "react"

import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"
import { plural } from "@/data/derive"
import type { SectionFacts } from "@/data/section-facts"
import { cn } from "@/lib/utils"

/**
 * What the hover card says about one section (Figma section 27,
 * `524:23541`): its name and code, its pipeline, then its basic facts. It
 * only reads: nothing in it is clicked. Unknown keeps its one mark, and a
 * proposal is said to wait, never shown as the value.
 */
export function SectionCard({
  title,
  code,
  pipeline,
  facts,
  proposals,
  className,
  ...props
}: SectionFacts & Omit<ComponentProps<"div">, "children" | "title">) {
  return (
    <div
      role="tooltip"
      className={cn(
        "flex w-70 flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-popover",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate type-ui-sm-medium">{title}</span>
          {code && (
            <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
              {code}
            </span>
          )}
        </div>
        <span className="truncate type-ui-xs text-muted-foreground">
          {pipeline}
        </span>
      </div>
      <dl className="flex flex-col gap-1 border-t pt-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-h-4.5 items-center gap-2">
            <dt className="w-18 shrink-0 type-ui-xs text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="min-w-0 truncate type-ui-xs">
              {fact.value ?? <StatusLabel status="unknown" />}
            </dd>
          </div>
        ))}
      </dl>
      {proposals > 0 && (
        <Badge variant="ai" className="self-start">
          {plural(proposals, "proposal")} waiting
        </Badge>
      )}
    </div>
  )
}
