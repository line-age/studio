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
      className={cn("group/rail w-full px-1 outline-none", className)}
      {...props}
    >
      {/* As shadcn Tabs on a muted list: the open one is a raised white tile. */}
      <span
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border px-0.5 pt-2 pb-1.5 transition-colors duration-100 group-focus-visible/rail:outline-2 group-focus-visible/rail:outline-offset-1 group-focus-visible/rail:outline-ring group-focus-visible/rail:outline-solid",
          active
            ? "border-border-subtle bg-background type-ui-2xs-medium text-foreground shadow-sm"
            : "border-transparent type-ui-2xs text-muted-foreground group-hover/rail:bg-accent group-hover/rail:text-foreground group-active/rail:bg-selected"
        )}
      >
        <span className="relative flex">
          <Icon name={icon} className={cn(active && "text-primary")} />
          {indicator && (
            <span
              className={cn(
                "absolute -top-1 -right-1.5 size-2 rounded-full ring-2",
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
      </span>
    </button>
  )
}
