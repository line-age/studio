import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** A quiet line that explains scope or keys. Plain and specific. */
export function Hint({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("type-ui-sm text-muted-foreground", className)}
      {...props}
    />
  )
}
