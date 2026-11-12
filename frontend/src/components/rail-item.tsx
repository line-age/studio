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
      {/* shadcn SidebarMenuButton in its icon size: flat, accent when open. */}
      <span
        className={cn(
          "relative flex size-8 items-center justify-center rounded-md transition-colors duration-100 group-hover/rail:bg-sidebar-accent group-focus-visible/rail:ring-2 group-focus-visible/rail:ring-ring",
          active && "bg-sidebar-accent text-sidebar-foreground"
        )}
      >
        <Icon name={icon} />
        {indicator && (
          <span
            className={cn(
              "absolute top-0.5 right-0.5 size-2 rounded-full ring-2",
              active ? "ring-sidebar-accent" : "ring-muted",
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
