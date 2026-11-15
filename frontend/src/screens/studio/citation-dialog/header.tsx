import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DialogHeader } from "@/components/ui/dialog"
import { citedClaims } from "@/data/derive"
import { featureIdentity } from "@/data/evidence"
import type { Claim, Section } from "@/data/schema"

import { useStudio } from "../studio-store"

/**
 * The claim and value, the feature's own identity line, and Previous/Next
 * through the section's cited claims with an "N of M" count. Figma `315:359`.
 */
export function CitationHeader({
  section,
  claim,
}: {
  section: Section
  claim: Claim
}) {
  const stepClaim = useStudio((s) => s.stepClaim)
  const cited = citedClaims(section)
  const at = cited.findIndex((c) => c.attribute === claim.attribute)

  return (
    <DialogHeader className="flex-row items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-ui-sm-medium break-words">
          {claim.attribute}
          {claim.value !== null && `: ${claim.value}`}
        </span>
        <span className="type-ui-xs text-muted-foreground">
          {featureIdentity(section)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous claim"
          disabled={at <= 0}
          onClick={() => stepClaim(section.claims, -1)}
        >
          <ChevronLeftIcon className="size-3.5" />
        </Button>
        <span className="type-ui-xs text-muted-foreground tabular-nums">
          {at + 1} of {cited.length}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next claim"
          disabled={at === -1 || at >= cited.length - 1}
          onClick={() => stepClaim(section.claims, 1)}
        >
          <ChevronRightIcon className="size-3.5" />
        </Button>
      </div>
    </DialogHeader>
  )
}
