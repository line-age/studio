import type { ReactNode } from "react"

import { Pin } from "@/components/pin"
import { cn } from "@/lib/utils"

/**
 * A numbered note from the Agent: what was found and where, with the passage
 * quoted in the source's own words. A note changes nothing by itself.
 */
export function Note({
  number,
  children,
  quote,
  className,
}: {
  number: number
  children: ReactNode
  /** The passage and where it is: '"12 IN."  1937 edition, grid ref. F-7'. */
  quote?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg bg-state-note-subtle p-2.5",
        className
      )}
    >
      <Pin number={number} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="type-ui-sm">{children}</p>
        {quote && (
          <blockquote className="border-l-2 border-state-note-foreground pl-2 type-ui-mono-xs">
            {quote}
          </blockquote>
        )}
      </div>
    </div>
  )
}
