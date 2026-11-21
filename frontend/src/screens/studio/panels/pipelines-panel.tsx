import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { PanelHeader } from "@/components/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  filterCounts,
  formatCount,
  narrowRows,
  plural,
  SCOPE,
} from "@/data/derive"

import { HidePanels } from "../panel-toggle"
import { usePanelWidth } from "../panel-width-context"
import {
  useCriteria,
  useSearchHits,
  useStudioData,
  useVisiblePipelines,
} from "../studio-data"
import { filtersApplied, listFollowsMap, useStudio } from "../studio-store"
import { CameraStatus } from "./camera-status"
import { FilterChips, SEARCH_PAST, useFilterChips } from "./filter-chips"
import { FiltersPanel } from "./filters-panel"
import { PipelineList, useOpenHit } from "./pipeline-list"
import { ScopeSwitch } from "./scope-switch"

export const SEARCH_INPUT_ID = "pipeline-search"

export function PipelinesPanel() {
  const { summaries, scoped, scope } = useStudioData()
  const visible = useVisiblePipelines()
  const { hits, outside } = useSearchHits()
  const whole = useStudio((s) => s.searchPastFilters)
  const setWhole = useStudio((s) => s.setSearchPastFilters)
  const query = useStudio((s) => s.query)
  const setQuery = useStudio((s) => s.setQuery)
  const onlyInView = useStudio(listFollowsMap)
  const setTableOpen = useStudio((s) => s.setTableOpen)
  const view = useStudio((s) => s.view)
  const criteria = useCriteria()
  const openHit = useOpenHit()
  const [active, setActive] = useState(0)
  const panelWidth = usePanelWidth()
  /** The filters open in place of the list, in this same panel. */
  const [mode, setMode] = useState<"list" | "filters">("list")
  /** The table was folded to open the filters: unfold it on the way back. */
  const folded = useRef(false)
  const openFilters = () => {
    // Filters are a narrow form: they open at the list's own width.
    if (panelWidth?.wide) {
      folded.current = true
      panelWidth.toggleWide()
    }
    setMode("filters")
  }
  const closeFilters = () => {
    setMode("list")
    if (folded.current) {
      folded.current = false
      panelWidth?.toggleWide()
    }
  }
  const filtered = useStudio(filtersApplied)

  // A list widened into a table holds everything: the map beside it is
  // narrower, and following it would take rows away.
  const wide = panelWidth?.wide ?? false
  useEffect(() => {
    setTableOpen(wide)
    return () => setTableOpen(false)
  }, [wide, setTableOpen])

  // Sections the filters leave: in the map view, of the whole network.
  const shown = useMemo(() => {
    const pick = (counts: ReturnType<typeof filterCounts>) =>
      criteria.status === "all" ? counts.all : counts.status[criteria.status]
    return {
      inView: pick(filterCounts(scoped, criteria, view)),
      all: pick(filterCounts(scoped, criteria)),
    }
  }, [scoped, criteria, view])

  const searching = query.trim().length > 0
  // The pipelines the filters leave, as the section count beside it.
  const pipelineCount = useMemo(
    () =>
      narrowRows(summaries, criteria).filter((row) => row.kind === "pipeline")
        .length,
    [summaries, criteria]
  )
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))

  // The filters in force; a search widened past them is one chip instead.
  const chips = useFilterChips(searching && whole)

  /** How many filters are on, as the chips list them. */
  const onCount = searching && whole ? 0 : chips.length

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

  if (mode === "filters") {
    return <FiltersPanel onBack={closeFilters} />
  }

  return (
    <>
      <PanelHeader
        title={SCOPE[scope].title}
        // Sections, whatever the rows are; on Pipelines, the pipelines too.
        meta={
          searching
            ? `${formatCount(hits.length)} match`
            : onlyInView && shown.inView < shown.all
              ? `${formatCount(shown.inView)} of ${formatCount(shown.all)} in view`
              : scope === "pipelines"
                ? `${plural(pipelineCount, "pipeline")} · ${plural(shown.all, "section")}`
                : plural(shown.all, "section")
        }
      >
        {panelWidth && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={panelWidth.wide ? "Show as list" : "Show as table"}
            aria-pressed={panelWidth.wide}
            className="text-muted-foreground aria-pressed:bg-selected aria-pressed:text-selected-foreground"
            onClick={panelWidth.toggleWide}
          >
            <Icon name="table" />
          </Button>
        )}
        <HidePanels />
      </PanelHeader>

      <div className="flex shrink-0 flex-col gap-2 border-b px-3 pb-2.5">
        {/* One area of the Help tour: the switch, the search, the filters. */}
        <div data-tour="list-tools" className="flex flex-col gap-2">
          <ScopeSwitch />
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute top-2 left-2.5 text-muted-foreground"
              />
              <Input
                id={SEARCH_INPUT_ID}
                type="search"
                name="pipeline-search"
                role="combobox"
                aria-label="Search name or code"
                aria-expanded={searching}
                aria-controls="pipeline-search-results"
                aria-activedescendant={
                  searching && hits.length > 0
                    ? `search-hit-${hits[activeIndex].summary.id}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
                placeholder="Search name or code"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={onSearchKeyDown}
                className="pr-8 pl-8.5 [&::-webkit-search-cancel-button]:hidden"
              />
              {searching ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear the search"
                  className="absolute top-1 right-1 text-muted-foreground"
                  onClick={() => {
                    setQuery("")
                    document.getElementById(SEARCH_INPUT_ID)?.focus()
                  }}
                >
                  <Icon name="close" />
                </Button>
              ) : (
                <Kbd className="absolute top-1.5 right-1.5">/</Kbd>
              )}
            </div>
            <Button
              variant={filtered ? "secondary" : "outline"}
              size="icon"
              aria-label={
                filtered
                  ? `Filters, ${plural(onCount, "is on", "are on")}`
                  : "Filters"
              }
              aria-pressed={filtered}
              className="relative"
              onClick={openFilters}
            >
              <Icon name="filter" />
              {filtered && onCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 type-ui-mono-xs text-primary-foreground"
                >
                  {onCount}
                </span>
              )}
            </Button>
          </div>
        </div>
        <FilterChips chips={chips} />
      </div>

      <PipelineList
        visible={visible}
        total={summaries.length}
        search={
          searching
            ? { hits, outside, activeIndex, query, open: openHit }
            : null
        }
      />

      {searching && (whole || outside > 0) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-1.5">
          <Hint>
            {whole
              ? `Searching ${SEARCH_PAST[scope].all}.`
              : `${formatCount(outside)} more ${outside === 1 ? "matches" : "match"} outside the filters.`}
          </Hint>
          <Button variant="ghost" size="xs" onClick={() => setWhole(!whole)}>
            {whole
              ? "Search inside the filters"
              : `Search ${SEARCH_PAST[scope].all}`}
          </Button>
        </div>
      )}

      <CameraStatus />
    </>
  )
}
