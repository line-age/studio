import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** Ghost button on the dark top bar. Text, or one icon with an aria-label. */
export function TopbarButton({
  kind = "text",
  className,
  ...props
}: { kind?: "text" | "icon" } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-control shrink-0 items-center justify-center gap-1.5 rounded-lg type-ui-sm-medium text-topbar-foreground transition-colors duration-100 outline-none hover:bg-topbar-hover focus-visible:ring-3 focus-visible:ring-ring active:bg-topbar-pressed",
        kind === "icon" ? "w-control" : "px-2.5",
        className
      )}
      {...props}
    />
  )
}
