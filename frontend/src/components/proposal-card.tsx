import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"

/**
 * A proposal waiting on a claim: the value now, the value proposed, and the
 * evidence given for it. It is only shown: a person decides, and deciding is
 * not built yet, so the card carries no actions.
 */
export function ProposalCard({
  now,
  proposed,
  evidence,
}: {
  /** The claim's value today; null is Unknown. */
  now: string | null
  proposed: string
  /** The source's own words and where they are. */
  evidence: string
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <Badge variant="ai">AI</Badge>
        <span className="type-ui-xs text-muted-foreground">
          Proposed, waiting for a decision
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
    </article>
  )
}
