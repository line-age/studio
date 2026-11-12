import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { ListHeader } from "@/components/list-header"
import { PanelHeader } from "@/components/panel-header"
import { PipelineRow } from "@/components/pipeline-row"
import { StatusBar } from "@/components/status-bar"
import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  formatCount,
  plural,
  type PipelineSummary,
  type SearchHit,
  type SearchMatch,
  type ShowFilter,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu } from "../add-to-agent"
import {
  useSearchHits,
  useStudioData,
  useVisiblePipelines,
} from "../studio-data"
import { useCamera, useStudio } from "../studio-store"

export const SEARCH_INPUT_ID = "pipeline-search"

const showLabels: Record<ShowFilter, string> = {
  all: "All pipelines",
  unknown: "With Unknown facts",
  proposals: "With proposals waiting",
  changed: "Changed since last review",
}

export function PipelinesPanel() {
  const { edition, summaries } = useStudioData()
  const visible = useVisiblePipelines()
  const hits = useSearchHits()
  const query = useStudio((s) => s.query)
  const setQuery = useStudio((s) => s.setQuery)
  const show = useStudio((s) => s.show)
  const onlyInView = useStudio((s) => s.onlyInView)
  const openHit = useOpenHit()
  const [active, setActive] = useState(0)

  const searching = query.trim().length > 0
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query.length > 0) {
        event.preventDefault()
        setQuery("")
      } else {
        event.currentTarget.blur()
      }
      return
    }
    if (!searching || hits.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive(Math.min(activeIndex + 1, hits.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      openHit(hits[activeIndex])
    }
  }

  return (
    <>
      <PanelHeader
        title="Pipelines"
        meta={
          searching
            ? `${formatCount(hits.length)} match`
            : `${formatCount(visible.length)} ${onlyInView ? "in view" : "shown"}`
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open as a table"
          className="text-muted-foreground"
        >
          <Icon name="table" className="size-3.5" />
        </Button>
      </PanelHeader>

      <div className="flex shrink-0 flex-col gap-2 border-b px-3 pb-2.5">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute top-2 left-2.5 text-muted-foreground"
          />
          <Input
            id={SEARCH_INPUT_ID}
            type="search"
            name="pipeline-search"
            role="combobox"
            aria-label="Search pipelines"
            aria-expanded={searching}
            aria-controls="pipeline-search-results"
            aria-activedescendant={
              searching && hits.length > 0
                ? `search-hit-${hits[activeIndex].summary.id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder="Search pipelines"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onSearchKeyDown}
            className="pr-8 pl-8.5 [&::-webkit-search-cancel-button]:hidden"
          />
          {!searching && <Kbd className="absolute top-1.5 right-1.5">/</Kbd>}
        </div>
        <div
          className="flex items-center gap-1.5"
          aria-label="Filters in force"
        >
          <Icon name="filter" className="size-3.5 text-muted-foreground" />
          <Badge variant="secondary">{edition.year}</Badge>
          {/* A search looks through the whole edition, whatever the filters say. */}
          {searching ? (
            <Badge variant="secondary">Whole edition</Badge>
          ) : (
            <>
              <Badge variant="secondary">{showLabels[show]}</Badge>
              {onlyInView && <Badge variant="secondary">Map view</Badge>}
            </>
          )}
        </div>
      </div>

      <PipelineList
        visible={visible}
        total={summaries.length}
        search={searching ? { hits, activeIndex, query, open: openHit } : null}
      />

      <CameraStatus />
    </>
  )
}

/** Opening a search hit selects it, moves the map to it and ends the search. */
function useOpenHit() {
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const selectSection = useStudio((s) => s.selectSection)
  const requestFit = useStudio((s) => s.requestFit)
  const setQuery = useStudio((s) => s.setQuery)
  return (hit: SearchHit) => {
    const sectionMatch = hit.matches.find((m) => m.kind === "section")
    if (sectionMatch) selectSection(hit.summary.id, sectionMatch.sectionId)
    else selectPipeline(hit.summary.id)
    requestFit(hit.summary.bounds)
    setQuery("")
  }
}

/** Why a pipeline is in the search results, when it is not its own name. */
function matchReason(matches: SearchMatch[]): string | null {
  for (const match of matches) {
    if (match.kind === "section") return `Section ${match.name}`
    if (match.kind === "sections") {
      return `${plural(match.count, "section")} match`
    }
    if (match.kind === "claim") return `${match.attribute}: ${match.value}`
  }
  return null
}

interface ListSearch {
  hits: SearchHit[]
  activeIndex: number
  query: string
  open: (hit: SearchHit) => void
}

/**
 * The pipeline list. A search narrows the same list to its hits and says on
 * the second line why each one matched; the rows look the same either way.
 */
function PipelineList({
  visible,
  total,
  search,
}: {
  visible: PipelineSummary[]
  total: number
  search: ListSearch | null
}) {
  const { edition } = useStudioData()
  const selectedId = useStudio((s) => s.selectedPipelineId)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const requestFit = useStudio((s) => s.requestFit)
  const onlyInView = useStudio((s) => s.onlyInView)
  const [descending, setDescending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // A selection made on the map can be off screen in the list: bring it in.
  useEffect(() => {
    if (!selectedId) return
    listRef.current
      ?.querySelector(`[data-pipeline="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selectedId])

  const select = (summary: PipelineSummary) => {
    selectPipeline(summary.id)
    requestFit(summary.bounds)
  }

  const rows = search
    ? search.hits.map((hit) => ({
        summary: hit.summary,
        hit,
        reason: matchReason(hit.matches),
      }))
    : visible.map((summary) => ({ summary, hit: null, reason: null }))
  // "Not in a pipeline" stays last whichever way the list runs.
  if (descending) {
    rows.reverse()
    rows.sort(
      (a, b) => Number(a.summary.unassigned) - Number(b.summary.unassigned)
    )
  }
  const activeHit = search?.hits[search.activeIndex]
  const tabStop = rows.some((row) => row.summary.id === selectedId)
    ? selectedId
    : rows[0]?.summary.id

  return (
    <>
      <ListHeader
        label="Pipeline"
        sorted={descending ? "descending" : "ascending"}
        sortLabel={`Pipeline order: ${descending ? "last first" : "first first"}. Reverse it`}
        onSort={() => setDescending((d) => !d)}
        trailing="Facts"
        selection={selectedId ? "indeterminate" : "unchecked"}
        selectionLabel="Clear the selection"
        onSelectionChange={() => selectPipeline(null)}
      />
      <div
        ref={listRef}
        id="pipeline-search-results"
        role="listbox"
        aria-label={search ? "Search results" : "Pipelines"}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {rows.map(({ summary, hit, reason }) => {
          const open = () =>
            hit && search ? search.open(hit) : select(summary)
          const sections = plural(summary.sections.length, "section")
          return (
            <AddToAgentMenu
              key={summary.id}
              items={
                summary.unassigned
                  ? summary.sections.map((s) => ({ kind: "section", id: s.id }))
                  : [{ kind: "pipeline", id: summary.id }]
              }
            >
              <PipelineRow
                id={hit ? `search-hit-${summary.id}` : undefined}
                role="option"
                aria-selected={summary.id === selectedId}
                data-roving
                data-pipeline={summary.id}
                tabIndex={summary.id === tabStop ? 0 : -1}
                selected={summary.id === selectedId}
                className={cn(hit && hit === activeHit && "bg-muted")}
                name={summary.name}
                meta={
                  reason ??
                  (summary.code ? `${summary.code} · ${sections}` : sections)
                }
                status={
                  summary.stats.unknown > 0 ? (
                    <StatusLabel status="unknown">
                      {formatCount(summary.stats.unknown)} Unknown
                    </StatusLabel>
                  ) : (
                    <StatusLabel status="cited" />
                  )
                }
                facts={`${formatCount(summary.stats.cited)} of ${formatCount(summary.stats.total)} facts`}
                onClick={open}
                onKeyDown={(event) => {
                  if (isActivate(event)) {
                    event.preventDefault()
                    open()
                  }
                }}
              />
            </AddToAgentMenu>
          )
        })}
        {rows.length === 0 &&
          (search ? (
            <Hint className="p-3" role="status">
              Nothing in the {edition.label} matches “{search.query.trim()}”.
            </Hint>
          ) : (
            <Hint className="p-3">
              {total === 0
                ? "This edition has no pipelines."
                : onlyInView
                  ? "No pipelines in the map view. Zoom out or pan, or switch off the map view filter in Filters."
                  : "No pipelines match the filters."}
            </Hint>
          ))}
      </div>
    </>
  )
}

function CameraStatus() {
  const zoom = useCamera((s) => s.zoom)
  const center = useCamera((s) => s.center)
  return (
    <StatusBar
      zoom={zoom === null ? "" : zoom.toFixed(2)}
      position={
        center === null
          ? ""
          : `${center[1].toFixed(3)}, ${center[0].toFixed(3)}`
      }
    />
  )
}
