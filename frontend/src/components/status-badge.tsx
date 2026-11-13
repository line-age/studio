import { Badge } from "@/components/ui/badge"
import { STATUS_LABEL, type SectionStatus } from "@/data/status"

const variants = {
  "not-started": "secondary",
  "in-progress": "note",
  sufficient: "outline",
  done: "cited",
} as const

/**
 * How far the work on a section, or on a pipeline, has come. Always the
 * word; the colour is a second cue.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: SectionStatus
  className?: string
}) {
  return (
    <Badge variant={variants[status]} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
