import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * One search hit: pipeline name and id, then why it matched. Stack one
 * SearchResultMatch per reason. Active is the keyboard highlight.
 */
export function SearchResult({
  name,
  code,
  active = false,
  children,
  className,
  ...props
}: {
  name: ReactNode
  code?: ReactNode
  active?: boolean
  children?: ReactNode
} & ComponentProps<"div">) {
  return (
    <div
      data-active={active || undefined}
      className={cn(
        "flex cursor-default flex-col gap-1 border-b border-border-subtle px-3 py-2.5 transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
        active ? "bg-accent" : "hover:bg-muted",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate type-ui-sm-medium">
          {name}
        </span>
        {code && (
          <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
            {code}
          </span>
        )}
      </span>
      {children}
    </div>
  )
}

/** One reason a pipeline matched: a quiet label, the matching text, a detail. */
export function SearchResultMatch({
  label,
  text,
  detail,
}: {
  label?: ReactNode
  text?: ReactNode
  detail?: ReactNode
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {label && (
        <span className="shrink-0 type-ui-xs text-muted-foreground">
          {label}
        </span>
      )}
      {text && <span className="truncate type-ui-xs-medium">{text}</span>}
      {detail && (
        <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
          {detail}
        </span>
      )}
    </span>
  )
}
