import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { plural, type SearchHit } from "@/data/derive"
import { isActivate } from "@/lib/roving"

import { AddToAgentMenu } from "../add-to-agent"
import { useStudioData } from "../studio-data"
import { listFollowsMap, useStudio } from "../studio-store"

/** Most sections listed under one hit before the rest are counted. */
const SECTION_ROWS = 6

/** The sections a search found under one row, each one a way straight in. */
export function FoundSections({
  pipelineId,
  found,
  open,
}: {
  /** The row's id, which the Agent's menu attaches them under. */
  pipelineId: string
  found: SearchHit["sections"]
  open: (sectionId: string) => void
}) {
  return (
    <>
      {found.slice(0, SECTION_ROWS).map((match) => (
        <AddToAgentMenu
          key={match.sectionId}
          items={[{ pipelineId, sectionIds: [match.sectionId] }]}
        >
          <div
            role="option"
            aria-selected={false}
            data-roving
            tabIndex={-1}
            onClick={() => open(match.sectionId)}
            onKeyDown={(event) => {
              if (isActivate(event)) {
                event.preventDefault()
                open(match.sectionId)
              }
            }}
            className="flex cursor-default items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-9.5 transition-colors duration-100 select-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid"
          >
            <Icon name="section" className="size-3.5 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate type-ui-sm">{match.name}</span>
                {match.code && (
                  <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
                    {match.code}
                  </span>
                )}
              </span>
              {match.reason && (
                <span className="truncate type-ui-xs text-muted-foreground">
                  {match.reason}
                </span>
              )}
            </span>
          </div>
        </AddToAgentMenu>
      ))}
      {found.length > SECTION_ROWS && (
        <p className="border-b border-border-subtle py-1.5 pr-3 pl-9.5 type-ui-xs text-muted-foreground">
          and {plural(found.length - SECTION_ROWS, "more section")}
        </p>
      )}
    </>
  )
}

/** What the Pipelines list says while the data has none (Figma `419:15535`). */
const NO_PIPELINES =
  "No pipelines yet. A pipeline is several sections that a person confirmed belong together. To make one, select sections and choose Make pipeline in the right-click menu, or ask the Agent to propose one. Every section is under Unplaced until then."

/** What an empty list says, so it is never a blank. */
export function EmptyList({
  search,
  total,
  hasSections,
}: {
  search: { outside: number; query: string } | null
  /** Rows the switch gives the list, before the filters and the view. */
  total: number
  hasSections: boolean
}) {
  const { scope } = useStudioData()
  const onlyInView = useStudio(listFollowsMap)
  if (search) {
    return (
      <Hint className="p-3" role="status">
        Nothing{search.outside > 0 ? " inside the filters" : ""} matches “
        {search.query.trim()}”.
      </Hint>
    )
  }
  return (
    <Hint className="p-3">
      {total === 0
        ? scope === "pipelines"
          ? NO_PIPELINES
          : scope === "unplaced" && hasSections
            ? "Every section is in a pipeline."
            : "This network has no sections."
        : onlyInView
          ? "Nothing in the map view. Zoom out or pan, or switch off “List follows the map” on the map."
          : "Nothing matches the filters."}
    </Hint>
  )
}
