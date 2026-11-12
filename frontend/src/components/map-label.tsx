import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** Small label floating over the map, for example the edition being shown. */
export function MapLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border bg-background px-2 py-1 type-ui-mono-xs shadow-map-control",
        className
      )}
      {...props}
    />
  )
}
