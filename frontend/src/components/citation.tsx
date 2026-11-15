import type { ComponentProps } from "react"

import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** One field of an open citation: a quiet label, then the words as recorded. */
export function Field({
  label,
  children,
}: {
  label: string
  children: string
}) {
  return (
    <div className="flex gap-2 border-b border-border-subtle py-1.5 pr-3 pl-8.5">
      <dt className="w-18 shrink-0 py-0.5 type-ui-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 type-ui-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * One source supporting one claim: its title and what it does for the claim
 * ("Shown on", "Not on", "States"). A click opens the citation pop-up, which
 * shows the rest of what is recorded about it.
 */
export function Citation({
  source,
  role,
  onClick,
  ...props
}: {
  source: string
  /** What the source does for the claim, in words. */
  role?: string
  onClick: () => void
} & Omit<ComponentProps<"li">, "children" | "role">) {
  return (
    <li {...props} className={cn("flex flex-col", props.className)}>
      <button
        type="button"
        onClick={onClick}
        className="flex h-9 w-full items-center gap-2 border-b border-border-subtle px-3 text-left transition-colors duration-100 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid"
      >
        <Icon name="source" className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate type-ui-sm">{source}</span>
        {role !== undefined && (
          <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
            {role}
          </span>
        )}
      </button>
    </li>
  )
}
