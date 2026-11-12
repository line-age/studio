import type { ComponentProps } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** One entry on the left icon rail: icon over label. Active marks the open panel. */
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
      {/* Only the icon sits on a chip; the open panel's chip is raised white. */}
      <span
        className={cn(
          "relative flex h-8 w-10 items-center justify-center rounded-lg border transition-colors duration-100 group-focus-visible/rail:outline-2 group-focus-visible/rail:outline-offset-1 group-focus-visible/rail:outline-ring group-focus-visible/rail:outline-solid",
          active
            ? "border-border bg-background text-primary shadow-sm"
            : "border-transparent group-hover/rail:bg-accent group-active/rail:bg-selected"
        )}
      >
        <Icon name={icon} />
        {indicator && (
          <span
            className={cn(
              "absolute top-1 right-1.5 size-2 rounded-full ring-2",
              active ? "ring-background" : "ring-muted",
              indicator.tone === "ai" ? "bg-state-ai" : "bg-primary"
            )}
          />
        )}
      </span>
      <span>
        {label}
        {indicator && <span className="sr-only">, {indicator.label}</span>}
      </span>
    </button>
  )
}
