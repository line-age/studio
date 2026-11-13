import { STATUSES, STATUS_LABEL, type StatusCounts } from "@/data/status"
import { cn } from "@/lib/utils"

const fills = {
  "not-started": "bg-border",
  "in-progress": "bg-state-note",
  sufficient: "bg-state-cited-subtle",
  done: "bg-state-cited",
} as const

/**
 * The sections of a group by status, as one thin bar. The same split is
 * given in words to assistive technology; the bar is never the only cue.
 */
export function StatusShareBar({
  counts,
  className,
}: {
  counts: StatusCounts
  className?: string
}) {
  const total = STATUSES.reduce((n, status) => n + counts[status], 0)
  const words = STATUSES.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${STATUS_LABEL[status].toLowerCase()}`)
    .join(", ")
  return (
    <span
      role="img"
      aria-label={words || "No sections"}
      className={cn(
        "flex h-1.5 overflow-hidden rounded-full bg-border",
        className
      )}
    >
      {total > 0 &&
        STATUSES.map(
          (status) =>
            counts[status] > 0 && (
              <span
                key={status}
                className={fills[status]}
                style={{ width: `${(counts[status] / total) * 100}%` }}
              />
            )
        )}
    </span>
  )
}
