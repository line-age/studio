import type { ComponentProps } from "react"

import { Icon } from "@/components/icons/icon"
import { StatusBadge } from "@/components/status-badge"
import { sectionLabel } from "@/data/derive"
import type { Section } from "@/data/schema"
import { missingRequired, sectionStatus } from "@/data/status"
import { cn } from "@/lib/utils"

/**
 * One section in the left list, under the group it belongs to: what it goes
 * by, how many of the required attributes are cited, and its status.
 */
export function SectionListRow({
  section,
  rule,
  selected,
  className,
  ...props
}: {
  section: Section
  /** The attributes that must be cited for sufficient data. */
  rule: readonly string[]
  selected: boolean
} & Omit<ComponentProps<"div">, "children">) {
  const cited = rule.length - missingRequired(section, rule).length
  return (
    <div
      role="option"
      aria-selected={selected}
      data-roving
      data-selected={selected || undefined}
      tabIndex={-1}
      className={cn(
        "flex cursor-default items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-9.5 transition-colors duration-100 select-none [contain-intrinsic-size:auto_45px] [content-visibility:auto] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        selected ? "bg-selected hover:bg-selected-hover" : "hover:bg-muted",
        className
      )}
      {...props}
    >
      <Icon name="section" className="size-3.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate type-ui-sm">{sectionLabel(section)}</span>
          {section.name !== null && (
            <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
              {section.code}
            </span>
          )}
        </span>
        <span className="truncate type-ui-xs text-muted-foreground tabular-nums">
          {cited} of {rule.length} required cited
        </span>
      </span>
      <StatusBadge status={sectionStatus(section, rule)} />
    </div>
  )
}
