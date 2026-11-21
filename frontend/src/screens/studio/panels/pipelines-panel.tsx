import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useShallow } from "zustand/react/shallow"

import { FilterChip } from "@/components/filter-chip"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { ListHeader } from "@/components/list-header"
import { PanelHeader } from "@/components/panel-header"
import { ListCell } from "@/components/list-cell"
import { ListGroupHeader } from "@/components/list-group-header"
import { PipelineRow } from "@/components/pipeline-row"
import { StatusBadge } from "@/components/status-badge"
import { StatusBar } from "@/components/status-bar"
import { StatusLabel } from "@/components/status-label"
import { StatusShareBar } from "@/components/status-share-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  filterCounts,
  formatCount,
  geometryBounds,
  plural,
  summaryProgress,
  type PipelineSummary,
  type SearchHit,
  narrowRows,
  tracerNames,
  SCOPE,
  type Scope,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { usePipelineChanges } from "../pipeline-actions"
import { HidePanels } from "../panel-toggle"
import { useSettings } from "../settings"
import {
  useCriteria,
  useSearchHits,
  useSelectionGroups,
  useStudioData,
  useVisiblePipelines,
} from "../studio-data"
import { usePanelWidth } from "../panel-width-context"
import {
  filtersApplied,
  listFollowsMap,
  useCamera,
  useStudio,
} from "../studio-store"
import { FiltersPanel } from "./filters-panel"
import { filterState, filtersInForce, type FilterWords } from "../filters"
import { listColumns } from "./list-columns"
import { ScopeSwitch } from "./scope-switch"

export const SEARCH_INPUT_ID = "pipeline-search"

/**
 * What a search widened past the filters looks through. It stays inside what
 * the switch shows (the owner, 2026-11-21), so it says that and never "the
 * whole network" where it is not.
 */
const SEARCH_PAST: Record<Scope, { chip: string; all: string }> = {
  all: { chip: "Whole network", all: "the whole network" },
  pipelines: { chip: "Every pipeline", all: "every pipeline" },
  unplaced: {
    chip: "Every unplaced section",
    all: "every unplaced section",
  },
}

export function PipelinesPanel() {
  const { summaries, scoped, scope, network } = useStudioData()
  const visible = useVisiblePipelines()
  const { hits, outside } = useSearchHits()
  const whole = useStudio((s) => s.searchWholeEdition)
  const setWhole = useStudio((s) => s.setSearchWholeEdition)
  const query = useStudio((s) => s.query)
  const setQuery = useStudio((s) => s.setQuery)
  const onlyInView = useStudio(listFollowsMap)
  const setTableOpen = useStudio((s) => s.setTableOpen)
  const view = useStudio((s) => s.view)
  const criteria = useCriteria()
  // The filters as the table in ../filters reads them, and the words its
  // chips need for things the state holds by id.
  const filterParts = useStudio(useShallow(filterState))
  const takeOff = useStudio((s) => s.takeOff)
  const words = useMemo<FilterWords>(() => {
    const editions = new Map(network.editions.map((e) => [e.id, e.label]))
    const tracers = tracerNames(network.sections)
    return {
      editionLabel: (id) => editions.get(id) ?? id,
      tracerName: (id) => tracers.get(id) ?? "someone",
    }
  }, [network])
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

  // The filters in force, each with the way to take it off. A search stays
  // inside the filters unless it was widened to the whole network.
  const chips: { label: string; hint: string; remove: () => void }[] = []
  if (searching && whole) {
    chips.push({
      label: SEARCH_PAST[scope].chip,
      hint: `The search looks through ${SEARCH_PAST[scope].all}, not only what the filters leave.`,
      remove: () => setWhole(false),
    })
  } else {
    for (const filter of filtersInForce(filterParts)) {
      chips.push({
        ...filter.chip(filterParts, words),
        remove: () => takeOff(filter.key),
      })
    }
  }

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
            {chips.length > 1 && (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => chips.forEach((chip) => chip.remove())}
              >
                Clear all
              </Button>
            )}
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
 * The list, as the switch has it. The pipelines, then the proposed ones,
 * then the sections in no pipeline under the edition that first shows each.
 * On Pipelines only the first two; on Unplaced only the last. A search narrows the
 * same list to its hits and lists the sections it found under each one.
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
  const { scope, network } = useStudioData()
  const hasSections = network.sections.length > 0
  const rule = useSettings((s) => s.requiredAttributes)
  const groups = useSelectionGroups()
  const select = useStudio((s) => s.select)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const addToSelection = useStudio((s) => s.addToSelection)
  const offerAgent = useStudio((s) => s.offerAgent)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const requestFit = useStudio((s) => s.requestFit)
  const selection = useStudio((s) => s.selection)
  const onlyInView = useStudio(listFollowsMap)
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
        {rows.length === 0 &&
          (search ? (
            <Hint className="p-3" role="status">
              Nothing{search.outside > 0 ? " inside the filters" : ""} matches “
              {search.query.trim()}”.
            </Hint>
          ) : (
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
          ))}
      </div>
    </>
  )
}

/** What the Pipelines list says while the data has none (Figma `419:15535`). */
const NO_PIPELINES =
  "No pipelines yet. A pipeline is several sections that a person confirmed belong together. To make one, select sections and choose Make pipeline in the right-click menu, or ask the Agent to propose one. Every section is under Unplaced until then."

function CameraStatus() {
  const zoom = useCamera((s) => s.zoom)
  const center = useCamera((s) => s.center)
  return (
    // Each number says what it is: the map's zoom, and the latitude and
    // longitude at its centre.
    <StatusBar
      zoom={zoom === null ? "" : `Zoom ${zoom.toFixed(2)}`}
      position={
        center === null
          ? ""
          : `Centre ${center[1].toFixed(3)}, ${center[0].toFixed(3)}`
      }
    />
  )
}
