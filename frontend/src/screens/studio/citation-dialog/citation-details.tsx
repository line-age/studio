import { Field } from "@/components/citation"
import { Hint } from "@/components/hint"
import { Icon, type IconName } from "@/components/icons/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  confidenceWords,
  editionWords,
  noQuoteWords,
  roleWords,
  supportsCountFor,
  supportsWords,
} from "@/data/evidence"
import type { Citation, Section } from "@/data/schema"

/** Which icon leads the selected citation's details. Mirrors `SourceList`. */
function iconFor(citation: Citation): IconName {
  if (citation.sourceKind === "map_sheet") return "scan"
  return citation.url !== undefined || citation.archiveUrl !== undefined
    ? "link"
    : "source"
}

/**
 * What the data holds about the selected citation, in the order
 * `AGENTS.md` sets: the source and its role; a map's edition; where; the
 * quote; the source's own identifier; confidence. The trace file is not
 * shown (OQ4). Figma `315:370`.
 */
export function CitationDetails({
  citation,
  section,
}: {
  citation: Citation
  section: Section
}) {
  const role = roleWords(citation.role)
  const edition = editionWords(citation)
  const noQuote = noQuoteWords(citation)
  const supports = supportsWords(supportsCountFor(section, citation))
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2 border-b border-border-subtle px-3 py-2">
        <Icon
          name={iconFor(citation)}
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className="truncate rounded-sm type-ui-sm-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              {citation.source}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {citation.source}
            </TooltipContent>
          </Tooltip>
          {role !== undefined && (
            <span className="type-ui-xs text-muted-foreground">{role}</span>
          )}
        </div>
      </div>
      <dl>
        {edition !== undefined && <Field label="Edition">{edition}</Field>}
        {citation.locator !== undefined && (
          <Field label="Where">{citation.locator}</Field>
        )}
        {citation.quote !== undefined && (
          <Field label="Quote">{citation.quote}</Field>
        )}
        {citation.identifier !== undefined && (
          <Field label="Identifier">{citation.identifier}</Field>
        )}
        {citation.confidence !== undefined && (
          <Field label="Confidence">
            {confidenceWords(citation.confidence)}
          </Field>
        )}
      </dl>
      {citation.quote === undefined && noQuote !== undefined && (
        <Hint className="px-3 py-1.5">{noQuote}</Hint>
      )}
      {supports !== undefined && (
        <Hint className="px-3 py-1.5">{supports}</Hint>
      )}
    </div>
  )
}
