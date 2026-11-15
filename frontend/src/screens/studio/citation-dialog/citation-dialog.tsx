import { useEffect } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { featureIdentity } from "@/data/evidence"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { CitationFooter } from "./footer"
import { CitationHeader } from "./header"

/**
 * A citation opened from any claim's sources: its claim, feature, source and
 * details, with Previous/Next through the section's cited claims. Mounts at
 * studio screen level, outside Detail. Figma `315:359`.
 */
export function CitationDialog() {
  const opened = useStudio((s) => s.openedCitation)
  const closeCitation = useStudio((s) => s.closeCitation)
  const stepClaim = useStudio((s) => s.stepClaim)
  const { sectionById } = useStudioData()

  const section = opened ? sectionById.get(opened.sectionId) : undefined
  const claim = section?.claims.find((c) => c.attribute === opened?.attribute)
  const citation = claim?.citations[opened?.citationIndex ?? 0]
  const isOpen =
    opened !== null &&
    section !== undefined &&
    claim !== undefined &&
    citation !== undefined

  useEffect(() => {
    if (!isOpen || !section) return
    const claims = section.claims
    // Capture phase, not onKeyDown on the dialog or a bubble listener on
    // document: Base UI's DialogPopup stops propagation of arrow keys at the
    // bubble phase (its own composite-navigation guard), and a disabled
    // Previous/Next button can take focus with it to the document, outside
    // the dialog's own bubble-phase handlers. Capture fires before either.
    function handleKeyDown(event: KeyboardEvent) {
      // A left or right arrow inside the source list picks a source, not a claim.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest("[data-citation-source-list]")
      ) {
        return
      }
      if (event.key === "ArrowRight") stepClaim(claims, 1)
      if (event.key === "ArrowLeft") stepClaim(claims, -1)
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [isOpen, section, stepClaim])

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && closeCitation()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        {section && claim && citation && (
          <>
            <DialogTitle className="sr-only">
              {`${claim.attribute} of ${featureIdentity(section)}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              The sources cited for this claim.
            </DialogDescription>
            <CitationHeader section={section} claim={claim} />
            <CitationFooter section={section} citation={citation} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
