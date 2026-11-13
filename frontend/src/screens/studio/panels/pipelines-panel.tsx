import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"

import { formatDateRange } from "@/components/date-range-picker"
import { FilterChip } from "@/components/filter-chip"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { ListHeader } from "@/components/list-header"
import { PanelHeader } from "@/components/panel-header"
import { PipelineRow } from "@/components/pipeline-row"
import { StatusBar } from "@/components/status-bar"
import { StatusLabel } from "@/components/status-label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatCount,
  geometryBounds,
  plural,
  type PipelineSummary,
  type SearchHit,
  type ShowFilter,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu } from "../add-to-agent"
import { HidePanels } from "../panel-toggle"
import {
  useSearchHits,
  useSelectionGroups,
  useStudioData,
  useVisiblePipelines,
} from "../studio-data"
import { useCamera, useStudio } from "../studio-store"

export const SEARCH_INPUT_ID = "pipeline-search"

const showLabels: Record<ShowFilter, string> = {
  all: "All",
  unknown: "With Unknown claims",
  proposals: "With proposals waiting",
  changed: "Changed since last review",
}

/** `many` is what the list holds: "pipelines", or "editions". */
const showHint = (show: ShowFilter, many: string): string =>
  ({
    all: `All the ${many}.`,
    unknown: `Only ${many} with at least one Unknown claim.`,
    proposals: `Only ${many} with a proposal from the Agent waiting for you.`,
    changed: `Only ${many} changed since the last review.`,
  })[show]

export function PipelinesPanel() {
  const { summaries, nouns } = useStudioData()
  const visible = useVisiblePipelines()
  const { hits, outside } = useSearchHits()
  const whole = useStudio((s) => s.searchWholeEdition)
  const setWhole = useStudio((s) => s.setSearchWholeEdition)
  const query = useStudio((s) => s.query)
  const setQuery = useStudio((s) => s.setQuery)
  const show = useStudio((s) => s.show)
  const onlyInView = useStudio((s) => s.onlyInView)
  const unknownIn = useStudio((s) => s.unknownIn)
  const companies = useStudio((s) => s.companies)
  const builtFrom = useStudio((s) => s.builtFrom)
  const builtTo = useStudio((s) => s.builtTo)
  const added = useStudio((s) => formatDateRange(s.addedFrom, s.addedTo))
  const setShow = useStudio((s) => s.setShow)
  const setOnlyInView = useStudio((s) => s.setOnlyInView)
  const toggleUnknownIn = useStudio((s) => s.toggleUnknownIn)
  const setCompanies = useStudio((s) => s.setCompanies)
  const setBuilt = useStudio((s) => s.setBuilt)
  const setAdded = useStudio((s) => s.setAdded)
  const openHit = useOpenHit()
  const [active, setActive] = useState(0)

  const searching = query.trim().length > 0
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))

  // The filters in force, each with the way to take it off. A search stays
  // inside the filters unless it was widened to the whole edition.
  const chips: { label: string; hint: string; remove: () => void }[] = []
  if (searching && whole) {
    chips.push({
      label: "Whole edition",
      hint: `The search looks through all the ${nouns.many}, not only the ones the filters leave.`,
      remove: () => setWhole(false),
    })
  } else {
    if (show !== "all") {
      chips.push({
        label: showLabels[show],
        hint: showHint(show, nouns.many),
        remove: () => setShow("all"),
      })
    }
    if (unknownIn.length > 0) {
      chips.push({
        label: `Unknown ${unknownIn.join(", ").toLocaleLowerCase()}`,
        hint: `Only ${nouns.many} with a section where one of these claims is Unknown.`,
        remove: () => unknownIn.forEach(toggleUnknownIn),
      })
    }
    if (companies.length > 0) {
      chips.push({
        label:
          companies.length === 1
            ? companies[0]
            : plural(companies.length, "company", "companies"),
        hint: `Only ${nouns.many} with a section owned by ${companies.join(", ")}.`,
        remove: () => setCompanies([]),
      })
    }
    if (builtFrom !== null || builtTo !== null) {
      chips.push({
        label:
          builtFrom !== null && builtTo !== null
            ? `Built ${builtFrom} to ${builtTo}`
            : builtFrom !== null
              ? `Built ${builtFrom} or later`
              : `Built ${builtTo} or earlier`,
        hint: `Only ${nouns.many} with a section built in these years. Sections with an Unknown build date are left out.`,
        remove: () => setBuilt(null, null),
      })
    }
    if (added) {
      chips.push({
        label: `Added: ${added}`,
        hint: `Only ${nouns.many} with a section added to Lineage on these days.`,
        remove: () => setAdded(null, null),
      })
    }
    if (onlyInView) {
      chips.push({
        label: "Map view",
        hint: `Only ${nouns.many} in the part of the map you are looking at. Move the map and the list follows.`,
        remove: () => setOnlyInView(false),
      })
    }
  }

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
        title={nouns.title}
        meta={
          searching
            ? `${formatCount(hits.length)} match`
            : `${formatCount(visible.length)} ${onlyInView ? "in view" : "shown"}`
        }
      >
        <HidePanels />
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
            aria-label={`Search ${nouns.many}`}
            aria-expanded={searching}
            aria-controls="pipeline-search-results"
            aria-activedescendant={
              searching && hits.length > 0
                ? `search-hit-${hits[activeIndex].summary.id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder={`Search ${nouns.many}`}
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
        {chips.length > 0 && (
          <div
            role="group"
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Filters in force"
          >
            {/* Says what the row is: stock shadcn Tooltip (owner, 2026-11-12). */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    className="flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                <Icon
                  name="filter"
                  className="size-3.5 text-muted-foreground"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                Filters applied to this list
              </TooltipContent>
            </Tooltip>
            {chips.map((chip) => (
              <FilterChip
                key={chip.label}
                hint={chip.hint}
                removeLabel={`Remove the filter: ${chip.label}`}
                onRemove={chip.remove}
              >
                {chip.label}
              </FilterChip>
            ))}
          </div>
        )}
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
              ? "Searching the whole edition."
              : `${plural(outside, `more ${nouns.one}`)} ${outside === 1 ? "matches" : "match"} outside the filters.`}
          </Hint>
          <Button variant="ghost" size="xs" onClick={() => setWhole(!whole)}>
            {whole ? "Search inside the filters" : "Search the whole edition"}
          </Button>
        </div>
      )}

      <CameraStatus />
    </>
  )
}

/** Opening a search hit selects it, moves the map to it and ends the search. */
function useOpenHit() {
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

/** Most sections listed under one hit before the rest are counted. */
const SECTION_ROWS = 6

interface ListSearch {
  hits: SearchHit[]
  /** How many more pipelines match beyond the filters. */
  outside: number
  activeIndex: number
  query: string
  open: (hit: SearchHit, sectionId?: string) => void
}

/**
 * The pipeline list. A search narrows the same list to its hits and lists
 * the sections it found under each one; the rows look the same either way.
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
  const { edition, nouns } = useStudioData()
  const groups = useSelectionGroups()
  const select = useStudio((s) => s.select)
  const addToSelection = useStudio((s) => s.addToSelection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const requestFit = useStudio((s) => s.requestFit)
  const onlyInView = useStudio((s) => s.onlyInView)
  const [descending, setDescending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  /** The row last clicked or ticked: where a Shift-click run starts. */
  const anchor = useRef<string | null>(null)

  // How much of each pipeline is selected: all of it, or some sections.
  const checkedOf = new Map(
    groups.map((g) => [
      g.summary.id,
      g.whole ? ("checked" as const) : ("indeterminate" as const),
    ])
  )
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

  const rows = search
    ? search.hits.map((hit) => ({
        summary: hit.summary,
        hit,
      }))
    : visible.map((summary) => ({ summary, hit: null }))
  // "Not in a pipeline" stays last whichever way the list runs.
  if (descending) {
    rows.reverse()
    rows.sort(
      (a, b) => Number(a.summary.unassigned) - Number(b.summary.unassigned)
    )
  }
  const activeHit = search?.hits[search.activeIndex]
  const tabStop =
    rows.find((row) => checkedOf.has(row.summary.id))?.summary.id ??
    rows[0]?.summary.id

  // A click selects just this pipeline; on the only selected one it takes
  // the selection off again. With Shift it adds the run from the last row.
  const pick = (summary: PipelineSummary, shift = false) => {
    const from = rows.findIndex((row) => row.summary.id === anchor.current)
    const to = rows.findIndex((row) => row.summary.id === summary.id)
    if (shift && from !== -1 && to !== -1) {
      const run = rows.slice(Math.min(from, to), Math.max(from, to) + 1)
      addToSelection(run.flatMap((row) => idsOf(row.summary)))
      return
    }
    anchor.current = summary.id
    if (only?.whole && onlyId === summary.id) {
      select([])
      return
    }
    select(idsOf(summary))
    requestFit(summary.bounds)
  }
  const allShown =
    rows.length > 0 &&
    rows.every((row) => checkedOf.get(row.summary.id) === "checked")

  return (
    <>
      <ListHeader
        label={capitalise(nouns.one)}
        sorted={descending ? "descending" : "ascending"}
        sortLabel={`${capitalise(nouns.one)} order: ${descending ? "last first" : "first first"}. Reverse it`}
        onSort={() => setDescending((d) => !d)}
        trailing="Claims"
        selection={
          groups.length === 0
            ? "unchecked"
            : allShown
              ? "checked"
              : "indeterminate"
        }
        selectionLabel={`Select all ${nouns.many} shown`}
        onSelectionChange={() =>
          select(
            groups.length === 0 ? rows.flatMap((row) => idsOf(row.summary)) : []
          )
        }
      />
      <div
        ref={listRef}
        id="pipeline-search-results"
        role="listbox"
        aria-label={search ? "Search results" : capitalise(nouns.many)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {rows.map(({ summary, hit }) => {
          const open = (shift = false) =>
            hit && search ? search.open(hit) : pick(summary, shift)
          const checked = checkedOf.get(summary.id) ?? "unchecked"
          const sections = plural(summary.sections.length, "section")
          const found = hit?.sections ?? []
          const meta = [
            summary.code,
            found.length > 0
              ? `${plural(found.length, "section")} ${found.length === 1 ? "matches" : "match"}`
              : sections,
          ]
            .filter(Boolean)
            .join(" · ")
          return (
            <Fragment key={summary.id}>
              <AddToAgentMenu
                items={[{ pipelineId: summary.id, sectionIds: "all" }]}
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
                  onCheck={() => {
                    anchor.current = summary.id
                    toggleSelected(idsOf(summary))
                  }}
                  className={cn(hit && hit === activeHit && "bg-muted")}
                  name={summary.name}
                  meta={meta}
                  status={
                    summary.stats.unknown > 0 ? (
                      <StatusLabel status="unknown">
                        {formatCount(summary.stats.unknown)} Unknown
                      </StatusLabel>
                    ) : (
                      <StatusLabel status="cited" />
                    )
                  }
                  claims={`${formatCount(summary.stats.cited)} of ${formatCount(summary.stats.total)} claims`}
                  onClick={(event) => open(event.shiftKey)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    // Space ticks the box; Enter selects just this pipeline.
                    if (event.key === " ") {
                      event.preventDefault()
                      anchor.current = summary.id
                      toggleSelected(idsOf(summary))
                    } else if (isActivate(event)) {
                      event.preventDefault()
                      open()
                    }
                  }}
                />
              </AddToAgentMenu>
              {/* The sections the search found, each one a way straight in. */}
              {hit &&
                search &&
                found.slice(0, SECTION_ROWS).map((match) => (
                  <AddToAgentMenu
                    key={match.sectionId}
                    items={[
                      { pipelineId: summary.id, sectionIds: [match.sectionId] },
                    ]}
                  >
                    <div
                      role="option"
                      aria-selected={false}
                      data-roving
                      tabIndex={-1}
                      onClick={() => search.open(hit, match.sectionId)}
                      onKeyDown={(event) => {
                        if (isActivate(event)) {
                          event.preventDefault()
                          search.open(hit, match.sectionId)
                        }
                      }}
                      className="flex cursor-default items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-9.5 transition-colors duration-100 select-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid"
                    >
                      <Icon
                        name="section"
                        className="size-3.5 text-muted-foreground"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2">
                          <span className="truncate type-ui-sm">
                            {match.name}
                          </span>
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
            </Fragment>
          )
        })}
        {rows.length === 0 &&
          (search ? (
            <Hint className="p-3" role="status">
              Nothing{" "}
              {search.outside > 0
                ? "inside the filters"
                : `in the ${edition.label}`}{" "}
              matches “{search.query.trim()}”.
            </Hint>
          ) : (
            <Hint className="p-3">
              {total === 0
                ? "This edition has no sections."
                : onlyInView
                  ? `No ${nouns.many} in the map view. Zoom out or pan, or switch off the map view filter in Filters.`
                  : `No ${nouns.many} match the filters.`}
            </Hint>
          ))}
      </div>
    </>
  )
}

const capitalise = (word: string) =>
  word.charAt(0).toLocaleUpperCase() + word.slice(1)

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
