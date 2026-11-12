import type { ComponentProps } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** One entry on the left icon rail. Active marks the open panel. */
export function RailItem({
  icon,
  label,
  active = false,
  indicator,
  className,
  ...props
}: {
  icon: IconName
  label: string
  active?: boolean
  /**
   * A dot on the icon when the panel has something to say. The label is its
   * meaning in words ("filters applied"); tone "ai" is the Agent's purple.
   */
  indicator?: { label: string; tone?: "primary" | "ai" } | null
} & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "group/rail flex w-full flex-col items-center gap-1 py-1 outline-none",
        active
          ? "type-ui-2xs-medium text-foreground"
          : "type-ui-2xs text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {/* The open panel's icon sits on a solid primary chip. */}
      <span
        className={cn(
          "relative flex h-8 w-10 items-center justify-center rounded-lg transition-colors duration-100 group-focus-visible/rail:shadow-focus-ring",
          active
            ? "bg-primary text-primary-foreground group-hover/rail:bg-primary-hover group-active/rail:bg-primary-pressed"
            : "group-hover/rail:bg-accent group-active/rail:bg-selected"
        )}
      >
        <span className="relative flex">
          <Icon name={icon} />
          {indicator && (
            <span
              className={cn(
                "absolute -top-1 -right-1.5 size-2 rounded-full ring-2",
                active ? "ring-primary" : "ring-muted",
                indicator.tone === "ai" ? "bg-state-ai" : "bg-primary"
              )}
            />
          )}
        </span>
      </span>
      <span>
        {label}
        {indicator && <span className="sr-only">, {indicator.label}</span>}
      </span>
    </button>
  )
}
