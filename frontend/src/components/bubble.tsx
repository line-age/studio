import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Your own message in the conversation. Agent answers are unframed text, not
 * bubbles.
 */
export function Bubble({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("rounded-xl bg-muted px-3 py-2 type-ui-sm", className)}
      {...props}
    />
  )
}
