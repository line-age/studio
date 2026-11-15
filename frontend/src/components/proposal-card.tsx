import type { ReactNode } from "react"

import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"

/**
 * A proposal waiting for a person: the value now, the value proposed, and the
 * evidence given for it (Figma ProposalCard). Shown on a claim it carries no
 * actions; in the Agent's inbox (`216:9658`) it carries the decision buttons
 * as `children`, and says who proposed it.
 */
export function ProposalCard({
  now,
  proposed,
  evidence,
  by,
  children,
}: {
  /** The value today; null is Unknown. */
  now: string | null
  proposed: string
  /** The source's own words and where they are, or why it is proposed. */
  evidence: string
  /** Who proposed it: a tool, never a person's name. */
  by?: string
  /** The decision, where it can be made here. */
  children?: ReactNode
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <Badge variant="ai">Proposed</Badge>
        <span className="type-ui-xs text-muted-foreground">
          {by ? `Proposed by ${by}` : "Waiting for a decision"}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-2">
        {now === null ? (
          <StatusLabel status="unknown" size="sm" />
        ) : (
          <span className="type-ui-mono-sm">{now}</span>
        )}
        <span aria-hidden="true" className="type-ui-sm text-muted-foreground">
          →
        </span>
        <span className="sr-only">proposed:</span>
        <span className="type-ui-mono-sm">{proposed}</span>
      </p>
      <p className="type-ui-xs break-words">{evidence}</p>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </article>
  )
}
