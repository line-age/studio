import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** Label above a group of controls in a panel. */
export function GroupLabel({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "flex h-8 items-center type-ui-xs-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
