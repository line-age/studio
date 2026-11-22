import { Fragment, useEffect, useRef, useState } from "react"

import { ListCell } from "@/components/list-cell"
import { ListGroupHeader } from "@/components/list-group-header"
import { ListHeader } from "@/components/list-header"
import { PipelineRow } from "@/components/pipeline-row"
import { StatusBadge } from "@/components/status-badge"
import { StatusLabel } from "@/components/status-label"
import { StatusShareBar } from "@/components/status-share-bar"
import { Badge } from "@/components/ui/badge"
import {
  formatCount,
  geometryBounds,
  SCOPE,
  summaryProgress,
  type PipelineSummary,
  type SearchHit,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { usePanelWidth } from "../panel-width-context"
import { usePipelineChanges } from "../pipeline-actions"
import { useSettings } from "../settings"
import { useSelectionGroups, useStudioData } from "../studio-data"
import { listFollowsMap, useStudio } from "../studio-store"
import { EmptyList, FoundSections } from "./list-parts"
import { listColumns } from "./list-columns"

/** Opening a search hit selects it, moves the map to it and ends the search. */
export function useOpenHit() {
  const { sectionById } = useStudioData()
  const select = useStudio((s) => s.select)
  const selectSection = useStudio((s) => s.selectSection)
  const requestFit = useStudio((s) => s.requestFit)
  const setQuery = useStudio((s) => s.setQuery)
  /** With a section id the hit opens on that section, else on the pipeline. */
  return (hit: SearchHit, sectionId?: string) => {
    const only = hit.sections.length === 1 ? hit.sections[0].sectionId : null
    const target = sectionId ?? only
    const section = target ? sectionById.get(target) : undefined
    if (section) {
      // A search hit can be anywhere: the list follows the map to it.
      selectSection(section.id)
      requestFit(geometryBounds(section.geometry), true)
    } else {
      select(hit.summary.sections.map((s) => s.id))
      requestFit(hit.summary.bounds, true)
    }
    setQuery("")
  }
}

export interface ListSearch {
  hits: SearchHit[]
  /** How many more pipelines match beyond the filters. */
  outside: number
  activeIndex: number
  query: string
  open: (hit: SearchHit, sectionId?: string) => void
}

/**
 * The list, as the switch has it. The pipelines, then the proposed ones,
 * then the sections in no pipeline under the edition that first shows each.
 * On Pipelines only the first two; on Unplaced only the last. A search narrows the
 * same list to its hits and lists the sections it found under each one.
 */
export function PipelineList({
  visible,
  total,
  search,
}: {
  visible: PipelineSummary[]
  total: number
  search: ListSearch | null
}) {
  const { scope, network } = useStudioData()
  const hasSections = network.sections.length > 0
  const followsMap = useStudio(listFollowsMap)
  const rule = useSettings((s) => s.requiredAttributes)
  const groups = useSelectionGroups()
  const select = useStudio((s) => s.select)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const addToSelection = useStudio((s) => s.addToSelection)
  const offerAgent = useStudio((s) => s.offerAgent)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const requestFit = useStudio((s) => s.requestFit)
  const selection = useStudio((s) => s.selection)
  const [descending, setDescending] = useState(false)
  const attachments = useSelectionAttachments()
  const pipelineChanges = usePipelineChanges()
  const listRef = useRef<HTMLDivElement>(null)
  /** The row last clicked or ticked: where a Shift-click run starts. */
  const anchor = useRef<string | null>(null)

  const only = groups.length === 1 ? groups[0] : null
  const onlyId = only?.summary.id ?? null
  const idsOf = (summary: PipelineSummary) => summary.sections.map((s) => s.id)

  // A selection made on the map can be off screen in the list: bring it in.
  useEffect(() => {
    if (!onlyId) return
    listRef.current
      ?.querySelector(`[data-pipeline="${CSS.escape(onlyId)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [onlyId])

  const all = search
    ? search.hits.map((hit) => ({ summary: hit.summary, hit }))
    : visible.map((summary) => ({ summary, hit: null }))
  // Pipelines, proposed pipelines, then what is in none; or the editions.
  // Whichever way each runs.
  const inPipelines = all.filter((row) => row.summary.kind === "pipeline")
  const proposed = all.filter((row) => row.summary.kind === "proposed")
  const loose = all.filter((row) => row.summary.unassigned)
  if (descending) {
    inPipelines.reverse()
    proposed.reverse()
    loose.reverse()
  }
  const rows = [...inPipelines, ...proposed, ...loose]
  // How much of each row is selected: all of what it shows, or some. Counted
  // from the row itself: a group's row is cut to the filters and the view.
  const checkedOf = new Map<string, "checked" | "indeterminate">()
  if (selection.size > 0) {
    for (const { summary } of rows) {
      const n = summary.sections.filter((s) => selection.has(s.id)).length
      if (n > 0) {
        checkedOf.set(
          summary.id,
          n === summary.sections.length ? "checked" : "indeterminate"
        )
      }
    }
  }
  const activeHit = search?.hits[search.activeIndex]
  const tabStop =
    rows.find((row) => checkedOf.has(row.summary.id))?.summary.id ??
    rows[0]?.summary.id

  // A click selects just this row's sections; on the only selected one it
  // takes the selection off again. With Shift it adds the run from the last.
  const pick = (summary: PipelineSummary, shift = false) => {
    const from = rows.findIndex((row) => row.summary.id === anchor.current)
    const to = rows.findIndex((row) => row.summary.id === summary.id)
    if (shift && from !== -1 && to !== -1) {
      const run = rows.slice(Math.min(from, to), Math.max(from, to) + 1)
      addToSelection(run.flatMap((row) => idsOf(row.summary)))
      offerAgent()
      return
    }
    anchor.current = summary.id
    // The row is all of the selection already: the click takes it off.
    if (
      checkedOf.get(summary.id) === "checked" &&
      selection.size === summary.sections.length
    ) {
      select([])
      return
    }
    if (summary.pipeline) selectPipeline(summary.id, idsOf(summary))
    else select(idsOf(summary))
    offerAgent()
    requestFit(summary.bounds)
  }
  // The box, Space and Ctrl or Cmd with a click add the row to the selection
  // or take it off, and leave the map where it is.
  const toggleRow = (summary: PipelineSummary) => {
    anchor.current = summary.id
    toggleSelected(idsOf(summary))
    offerAgent()
  }
  const allShown =
    rows.length > 0 &&
    rows.every((row) => checkedOf.get(row.summary.id) === "checked")
  const column = SCOPE[scope].column
  // Only a pipeline has a code and a progress; an edition has neither, and
  // leaves those columns empty where pipelines are listed with it.
  const hasCodes = scope !== "unplaced"
  // "Done" is about pipelines; a group in no pipeline shows its size there.
  const panelWidth = usePanelWidth()
  const columns = listColumns(panelWidth?.width ?? 0, rule)
  // In the table the progress is a column of its own and lines up under its
  // head; in the plain list it is as wide as its words, to leave names room.
  const progressCell = (text: string) =>
    columns.detail ? <ListCell column="progress">{text}</ListCell> : text

  const renderRow = ({ summary, hit }: (typeof rows)[number]) => {
    const open = (shift = false) =>
      hit && search ? search.open(hit) : pick(summary, shift)
    const checked = checkedOf.get(summary.id) ?? "unchecked"
    const found = hit?.sections ?? []
    // A pipeline no source names says so, and goes by its code.
    const name =
      summary.pipeline && summary.pipeline.name === null ? (
        <span title={summary.code ?? undefined} className="flex min-w-0">
          <StatusLabel status="unknown">Unknown name</StatusLabel>
          <span className="sr-only">, {summary.code}</span>
        </span>
      ) : (
        summary.label
      )
    return (
      <Fragment key={summary.id}>
        {/* On a row of the selection the menu offers all of the selection. */}
        <AddToAgentMenu
          changes={
            checked !== "unchecked" ? pipelineChanges([...selection]) : []
          }
          items={
            checked !== "unchecked"
              ? attachments
              : [
                  {
                    pipelineId: summary.id,
                    // A group goes as its sections; see add-to-agent.
                    sectionIds: summary.unassigned ? idsOf(summary) : "all",
                  },
                ]
          }
        >
          <PipelineRow
            id={hit ? `search-hit-${summary.id}` : undefined}
            role="option"
            aria-selected={checked !== "unchecked"}
            data-roving
            data-pipeline={summary.id}
            tabIndex={summary.id === tabStop ? 0 : -1}
            selected={checked !== "unchecked"}
            checked={checked}
            checkLabel={`Select ${summary.name}`}
            onCheck={() => toggleRow(summary)}
            className={cn(hit && hit === activeHit && "bg-muted")}
            name={name}
            cells={
              <>
                {columns.detail && (
                  <>
                    {hasCodes && (
                      <ListCell column="code" className="type-ui-mono-xs">
                        {summary.unassigned ? "" : summary.code}
                      </ListCell>
                    )}
                    <ListCell column="sections">
                      {formatCount(summary.sections.length)}
                    </ListCell>
                  </>
                )}
                {columns.attributes.map((attribute) => {
                  const unknown = summary.unknownByAttribute[attribute] ?? 0
                  return (
                    <ListCell key={attribute} column="attribute">
                      {unknown > 0 ? (
                        <StatusLabel status="unknown">
                          {formatCount(unknown)} Unknown
                        </StatusLabel>
                      ) : (
                        <StatusLabel status="cited">Cited</StatusLabel>
                      )}
                    </ListCell>
                  )
                })}
              </>
            }
            progress={
              summary.unassigned ? (
                // The table has a Sections column; the list has only this.
                columns.detail ? (
                  // Grouped by edition no row has a progress: no column.
                  hasCodes && progressCell("")
                ) : (
                  <span
                    title={summaryProgress(summary, "long")}
                    className="type-ui-mono-xs"
                  >
                    {summaryProgress(summary)}
                  </span>
                )
              ) : summary.kind === "proposed" ? (
                <span title={summaryProgress(summary, "long")}>
                  {progressCell(summaryProgress(summary))}
                </span>
              ) : columns.detail ? (
                progressCell(summaryProgress(summary))
              ) : (
                // The narrow list leaves the name its room: "4/7", with what
                // it counts in the title.
                <span
                  title={summaryProgress(summary, "long")}
                  className="type-ui-mono-xs"
                >
                  {summaryProgress(summary).replace(" done", "")}
                </span>
              )
            }
            // One status: in the table, how the sections split, then the
            // word for the whole, side by side under one head.
            statusWide={columns.bar}
            status={
              <>
                {columns.bar && (
                  <StatusShareBar
                    counts={summary.statusCounts}
                    className="min-w-0 flex-1"
                  />
                )}
                {summary.kind === "proposed" ? (
                  <Badge variant="ai">Proposed</Badge>
                ) : (
                  <StatusBadge status={summary.status} />
                )}
              </>
            }
            onClick={(event) =>
              (event.ctrlKey || event.metaKey) && !hit
                ? toggleRow(summary)
                : open(event.shiftKey)
            }
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              // Space ticks the box; Enter selects just this row.
              if (event.key === " ") {
                event.preventDefault()
                toggleRow(summary)
              } else if (isActivate(event)) {
                event.preventDefault()
                open()
              }
            }}
          />
        </AddToAgentMenu>
        {hit && search && (
          <FoundSections
            pipelineId={summary.id}
            found={found}
            open={(sectionId) => search.open(hit, sectionId)}
          />
        )}
      </Fragment>
    )
  }

  return (
    <>
      <ListHeader
        label={column}
        sorted={descending ? "descending" : "ascending"}
        sortLabel={`${column} order: ${descending ? "last first" : "first first"}. Reverse it`}
        onSort={() => setDescending((d) => !d)}
        trailing={
          <span className="flex items-center gap-1.5">
            {columns.detail && (
              <>
                {hasCodes && <ListCell column="code">Code</ListCell>}
                <ListCell column="sections">Sections</ListCell>
              </>
            )}
            {columns.attributes.map((attribute) => (
              <ListCell key={attribute} column="attribute">
                {attribute}
              </ListCell>
            ))}
            {columns.detail && hasCodes && <ListCell column="progress" />}
            <span className={columns.bar ? "w-52 pl-3" : "w-21 text-right"}>
              Status
            </span>
          </span>
        }
        // Speaks for the rows shown only. A section the switch hides stays
        // selected whatever this box does.
        selection={
          checkedOf.size === 0
            ? "unchecked"
            : allShown
              ? "checked"
              : "indeterminate"
        }
        selectionLabel="Select everything shown"
        onSelectionChange={() => {
          const shown = rows.flatMap((row) => idsOf(row.summary))
          if (checkedOf.size === 0) addToSelection(shown)
          else {
            const off = new Set(shown)
            select([...selection].filter((id) => !off.has(id)))
          }
          offerAgent()
        }}
      />
      <div
        ref={listRef}
        id="pipeline-search-results"
        role="listbox"
        aria-label={search ? "Search results" : SCOPE[scope].title}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {scope !== "unplaced" && inPipelines.length > 0 && (
          <ListGroupHeader count={formatCount(inPipelines.length)}>
            Pipelines
          </ListGroupHeader>
        )}
        {inPipelines.map(renderRow)}
        {proposed.length > 0 && (
          <ListGroupHeader count={formatCount(proposed.length)}>
            Proposed pipelines
          </ListGroupHeader>
        )}
        {proposed.map(renderRow)}
        {scope === "all" && loose.length > 0 && (
          // Counts sections, as the rows under it do, not the rows.
          <ListGroupHeader
            count={formatCount(
              loose.reduce((n, row) => n + row.summary.sections.length, 0)
            )}
          >
            Not in a pipeline
          </ListGroupHeader>
        )}
        {loose.map(renderRow)}
        {rows.length === 0 && (
          <EmptyList
            search={search}
            total={total}
            hasSections={hasSections}
            scope={scope}
            followsMap={followsMap}
          />
        )}
      </div>
    </>
  )
}
