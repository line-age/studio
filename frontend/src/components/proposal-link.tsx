import type { ComponentProps } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * A link between a proposal and the Agent: from an answer to the proposal it
 * made, or from a proposal to a question about it. The purple badge always
 * carries a word: "AI" by default, or "Proposed".
 */
export function ProposalLink({
  badge = "AI",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { badge?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors duration-100 outline-none hover:bg-muted focus-visible:shadow-focus-ring",
        className
      )}
      {...props}
    >
      <Badge variant="ai">{badge}</Badge>
      <span className="min-w-0 flex-1 truncate type-ui-xs-medium">
        {children}
      </span>
      <Icon name="chevron-right" className="size-3.5 text-muted-foreground" />
    </button>
  )
}
