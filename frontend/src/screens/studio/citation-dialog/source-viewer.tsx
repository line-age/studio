import { Icon } from "@/components/icons/icon"
import { editionWords } from "@/data/evidence"
import type { Citation } from "@/data/schema"

/**
 * The citation pop-up's left pane. Figma SourceViewer `336:13243` has four
 * kinds (web, text, scan, unavailable); phase 1 ships only unavailable,
 * which is what today's scans show until Studio can serve scan images
 * (OQ1). No scan pane or zoom control. Figma `336:13233`.
 */
export function SourceViewer({ citation }: { citation: Citation }) {
  const edition = editionWords(citation)
  return (
    <div className="flex h-80 w-72 shrink-0 flex-col items-center justify-center gap-2 bg-muted px-6 text-center">
      <Icon name="warning" className="size-6 text-muted-foreground" />
      <p className="type-ui-sm-medium">{citation.source}</p>
      {edition !== undefined && (
        <p className="type-ui-xs text-muted-foreground">{edition}</p>
      )}
      <p className="max-w-xs type-ui-sm text-muted-foreground">
        Studio cannot show this source yet.
      </p>
    </div>
  )
}
