import { useMemo } from "react"

import { badgeVariants } from "@/components/ui/badge"
import { filterCounts, formatCount } from "@/data/derive"
import { STATUSES, STATUS_LABEL, type SectionStatus } from "@/data/status"
import { cn } from "@/lib/utils"

import { useCriteria, useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/** A count that is also a one-click filter. */
function CountToggle({
  label,
  count,
  pressed,
  tone = "plain",
  onClick,
}: {
  label: string
  count: number
  pressed: boolean
  /** "ai" is the Agent's colour: something waits for the person. */
  tone?: "plain" | "ai"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        badgeVariants({
          variant: pressed ? "default" : tone === "ai" ? "ai" : "secondary",
        }),
        "cursor-default gap-1.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !pressed && "hover:bg-accent"
      )}
    >
      {label}
      <span
        className={cn(!pressed && tone === "plain" && "text-muted-foreground")}
      >
        {formatCount(count)}
      </span>
    </button>
  )
}

/**
 * The sections of the edition counted by status, above the list. Each count
 * is a filter: one status at a time, and "Needs your decision" on top of any.
 * The counts are sections, after the other filters.
 */
export function StatusCounts() {
  const { summaries } = useStudioData()
  const criteria = useCriteria()
  const status = useStudio((s) => s.status)
  const setStatus = useStudio((s) => s.setStatus)
  const needsDecisionOnly = useStudio((s) => s.needsDecisionOnly)
  const setNeedsDecisionOnly = useStudio((s) => s.setNeedsDecisionOnly)
  const onlyInView = useStudio((s) => s.onlyInView)
  const view = useStudio((s) => s.view)

  const counts = useMemo(
    () => filterCounts(summaries, criteria, onlyInView ? view : null),
    [summaries, criteria, onlyInView, view]
  )

  return (
    <div
      role="group"
      aria-label="Sections by status"
      className="flex flex-wrap items-center gap-1.5"
    >
      <CountToggle
        label="All"
        count={counts.all}
        pressed={status === "all"}
        onClick={() => setStatus("all")}
      />
      {STATUSES.map((s: SectionStatus) => (
        <CountToggle
          key={s}
          label={STATUS_LABEL[s]}
          count={counts.status[s]}
          pressed={status === s}
          onClick={() => setStatus(s)}
        />
      ))}
      <CountToggle
        label="Needs your decision"
        tone="ai"
        count={counts.needsDecision}
        pressed={needsDecisionOnly}
        onClick={() => setNeedsDecisionOnly(!needsDecisionOnly)}
      />
    </div>
  )
}
