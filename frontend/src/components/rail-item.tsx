import type { ComponentProps } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** One entry on the left icon rail. Active marks the open panel. */
export function RailItem({
  icon,
  label,
  active = false,
  badge,
  className,
  ...props
}: {
  icon: IconName
  label: string
  active?: boolean
  /** Count of unread Agent notes, shown in note yellow. */
  badge?: number
} & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "group/rail flex w-full flex-col items-center gap-0.5 py-1 outline-none",
        active
          ? "type-ui-2xs-medium text-foreground"
          : "type-ui-2xs text-muted-foreground",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "relative flex size-8 items-center justify-center rounded-md transition-colors duration-100 group-focus-visible/rail:shadow-focus-ring",
          active
            ? "bg-primary-subtle"
            : "group-hover/rail:bg-accent group-active/rail:bg-selected"
        )}
      >
        <Icon name={icon} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1.5 flex size-3.5 items-center justify-center rounded-full border border-map-pin-foreground bg-state-note type-ui-mono-2xs text-map-pin-foreground">
            <span className="sr-only">, </span>
            {badge}
            <span className="sr-only"> {badge === 1 ? "note" : "notes"}</span>
          </span>
        )}
      </span>
      {label}
    </button>
  )
}
