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
  type ShowFilter,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"

import {
  useSearchHits,
  useStudioData,
  useVisiblePipelines,
} from "../studio-data"
import { useCamera, useStudio } from "../studio-store"
import { SearchResults } from "./search-results"

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
        {searching ? (
          <Hint>
            Searching all {plural(summaries.length, "pipeline")} in the{" "}
            {edition.label}, not only the map view.
          </Hint>
        ) : (
          <div
            className="flex items-center gap-1.5"
            aria-label="Filters in force"
          >
            <Icon name="filter" className="size-3.5 text-muted-foreground" />
            <Badge variant="secondary">{edition.year}</Badge>
            <Badge variant="secondary">{showLabels[show]}</Badge>
            {onlyInView && <Badge variant="secondary">Map view</Badge>}
          </div>
        )}
      </div>

      {searching ? (
        <SearchResults
          hits={hits}
          activeIndex={activeIndex}
          onOpen={openHit}
          query={query}
        />
      ) : (
        <PipelineList visible={visible} total={summaries.length} />
      )}

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

function PipelineList({
  visible,
  total,
}: {
  visible: PipelineSummary[]
  total: number
}) {
  const selectedId = useStudio((s) => s.selectedPipelineId)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const requestFit = useStudio((s) => s.requestFit)
  const onlyInView = useStudio((s) => s.onlyInView)
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
  const tabStop = visible.some((s) => s.id === selectedId)
    ? selectedId
    : visible[0]?.id

  return (
    <>
      <ListHeader label="Pipeline" sorted trailing="Facts" />
      <div
        ref={listRef}
        role="listbox"
        aria-label="Pipelines"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {visible.map((summary) => (
          <PipelineRow
            key={summary.id}
            role="option"
            aria-selected={summary.id === selectedId}
            data-roving
            data-pipeline={summary.id}
            tabIndex={summary.id === tabStop ? 0 : -1}
            selected={summary.id === selectedId}
            name={summary.name}
            meta={
              summary.code
                ? `${summary.code} · ${plural(summary.sections.length, "section")}`
                : plural(summary.sections.length, "section")
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
            onClick={() => select(summary)}
            onKeyDown={(event) => {
              if (isActivate(event)) {
                event.preventDefault()
                select(summary)
              }
            }}
          />
        ))}
        {visible.length === 0 && (
          <Hint className="p-3">
            {total === 0
              ? "This edition has no pipelines."
              : onlyInView
                ? "No pipelines in the map view. Zoom out or pan, or switch off the map view filter in Filters."
                : "No pipelines match the filters."}
          </Hint>
        )}
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
