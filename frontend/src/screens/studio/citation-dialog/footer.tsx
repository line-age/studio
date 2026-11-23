import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { geometryBounds } from "@/data/derive"
import type { Section } from "@/data/schema"

import { useStudio } from "../studio-store"

/**
 * Show on map (focuses the section and fits it, then closes) and Done. A
 * source's own link sits with that source, in the list.
 */
export function CitationFooter({ section }: { section: Section }) {
  const focusSection = useStudio((s) => s.focusSection)
  const requestFit = useStudio((s) => s.requestFit)
  const closeCitation = useStudio((s) => s.closeCitation)

  return (
    <DialogFooter className="m-0 min-w-0 px-4 py-3">
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
