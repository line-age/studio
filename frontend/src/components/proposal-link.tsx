import type { ComponentProps } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Link from an Agent answer to the proposal it made. The purple badge always
 * carries the word AI.
 */
export function ProposalLink({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors duration-100 outline-none hover:bg-muted focus-visible:shadow-focus-ring",
        className
      )}
      {...props}
    >
      <Badge variant="ai">AI</Badge>
      <span className="min-w-0 flex-1 truncate type-ui-xs-medium">
        {children}
      </span>
      <Icon name="chevron-right" className="size-3.5 text-muted-foreground" />
    </button>
  )
}
