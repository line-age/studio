import { useMemo } from "react"

import { badgeVariants } from "@/components/ui/badge"
import { filterCounts, formatCount } from "@/data/derive"
import { STATUSES, STATUS_LABEL, type SectionStatus } from "@/data/status"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { useCriteria, useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/** A count that is also a one-click filter. */
function CountToggle({
  label,
  fullLabel,
  count,
  pressed,
  tone = "plain",
  onClick,
}: {
  label: string
  /** The whole name when `label` is a short form: read out and on hover. */
  fullLabel?: string
  count: number
  pressed: boolean
  /** "ai" is the Agent's colour: something waits for the person. */
  tone?: "plain" | "ai"
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={fullLabel ? `${fullLabel} ${formatCount(count)}` : undefined}
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
  if (!fullLabel) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="bottom">{fullLabel}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The sections of the edition counted by status, above the list. Each count
 * is a filter: one status at a time, and "Needs your decision" on top of any.
 * The counts are sections of the whole edition, after the other filters. They
 * never follow the map: moving it, resizing a panel or opening the table does
 * not change them. Only the list follows the map.
 */
export function StatusCounts() {
  const { summaries } = useStudioData()
  const criteria = useCriteria()
  const status = useStudio((s) => s.status)
  const setStatus = useStudio((s) => s.setStatus)
  const needsDecisionOnly = useStudio((s) => s.needsDecisionOnly)
  const setNeedsDecisionOnly = useStudio((s) => s.setNeedsDecisionOnly)

  const counts = useMemo(
    () => filterCounts(summaries, criteria),
    [summaries, criteria]
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
        // Short so the counts fit on two rows of the list (the owner,
        // 2026-11-13); the whole name is read out and shown on hover.
        label="To decide"
        fullLabel="Needs your decision"
        tone="ai"
        count={counts.needsDecision}
        pressed={needsDecisionOnly}
        onClick={() => setNeedsDecisionOnly(!needsDecisionOnly)}
      />
    </div>
  )
}
