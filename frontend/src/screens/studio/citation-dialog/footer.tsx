import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { geometryBounds } from "@/data/derive"
import type { Citation, Section } from "@/data/schema"

import { useStudio } from "../studio-store"

/**
 * Show on map (focuses the section and fits it, then closes), Open source
 * (hidden with no web address or archived copy), and Done. Figma `315:359`.
 */
export function CitationFooter({
  section,
  citation,
}: {
  section: Section
  citation: Citation
}) {
  const focusSection = useStudio((s) => s.focusSection)
  const requestFit = useStudio((s) => s.requestFit)
  const closeCitation = useStudio((s) => s.closeCitation)
  const href = citation.url ?? citation.archiveUrl

  return (
    <DialogFooter>
      {href !== undefined && (
        <Button
          variant="outline"
          size="sm"
          render={<a href={href} target="_blank" rel="noopener" />}
        >
          Open source
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          focusSection(section.id)
          requestFit(geometryBounds(section.geometry), true)
          closeCitation()
        }}
      >
        Show on map
      </Button>
      <Button size="sm" onClick={closeCitation}>
        Done
      </Button>
    </DialogFooter>
  )
}
