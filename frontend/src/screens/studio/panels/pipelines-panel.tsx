import {
  Fragment,
  useEffect,
  useMemo,
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
import { ListCell } from "@/components/list-cell"
import { ListGroupHeader } from "@/components/list-group-header"
import { PipelineRow } from "@/components/pipeline-row"
import { StatusBadge } from "@/components/status-badge"
import { StatusBar } from "@/components/status-bar"
import { StatusLabel } from "@/components/status-label"
import { StatusShareBar } from "@/components/status-share-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  citedLabel,
  filterCounts,
  formatCount,
  geometryBounds,
  plural,
  sectionLabel,
  summaryProgress,
  type PipelineSummary,
  type SearchHit,
} from "@/data/derive"
import { sectionStatus } from "@/data/status"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
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
import { EditionSelect } from "./edition-select"
import { FiltersPanel } from "./filters-panel"
import { listColumns } from "./list-columns"
import { StatusCounts } from "./status-counts"

export const SEARCH_INPUT_ID = "pipeline-search"

export function PipelinesPanel() {
  const { summaries } = useStudioData()
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
  const unknownIn = useStudio((s) => s.unknownIn)
  const companies = useStudio((s) => s.companies)
  const builtFrom = useStudio((s) => s.builtFrom)
  const builtTo = useStudio((s) => s.builtTo)
  const added = useStudio((s) => formatDateRange(s.addedFrom, s.addedTo))
  const toggleUnknownIn = useStudio((s) => s.toggleUnknownIn)
  const setCompanies = useStudio((s) => s.setCompanies)
  const setBuilt = useStudio((s) => s.setBuilt)
  const setAdded = useStudio((s) => s.setAdded)
  const openHit = useOpenHit()
  const [active, setActive] = useState(0)
  const panelWidth = usePanelWidth()
  /** The filters open in place of the list, in this same panel. */
  const [mode, setMode] = useState<"list" | "filters">("list")
  const filtered = useStudio(filtersApplied)

  // A list widened into a table holds everything: the map beside it is
  // narrower, and following it would take rows away.
  const wide = panelWidth?.wide ?? false
  useEffect(() => {
    setTableOpen(wide)
    return () => setTableOpen(false)
  }, [wide, setTableOpen])

  // Sections, like the status counts: in the map view, of the whole edition.
  const shown = useMemo(() => {
    const pick = (counts: ReturnType<typeof filterCounts>) =>
      criteria.status === "all" ? counts.all : counts.status[criteria.status]
    return {
      inView: pick(filterCounts(summaries, criteria, view)),
      all: pick(filterCounts(summaries, criteria)),
    }
  }, [summaries, criteria, view])

  const searching = query.trim().length > 0
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0))

  // The filters in force, each with the way to take it off. A search stays
  // inside the filters unless it was widened to the whole edition.
  const chips: { label: string; hint: string; remove: () => void }[] = []
  if (searching && whole) {
    chips.push({
      label: "Whole edition",
      hint: "The search looks through every section of the edition, not only what the filters leave.",
      remove: () => setWhole(false),
    })
  } else {
    if (unknownIn.length > 0) {
      chips.push({
        label: `Unknown ${unknownIn.join(", ").toLocaleLowerCase()}`,
        hint: "Only what has a section where one of these claims is Unknown.",
        remove: () => unknownIn.forEach(toggleUnknownIn),
      })
    }
    if (companies.length > 0) {
      chips.push({
        label:
          companies.length === 1
            ? companies[0]
            : plural(companies.length, "company", "companies"),
        hint: `Only what has a section owned by ${companies.join(", ")}.`,
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
        hint: "Only what has a section built in these years. Sections with an Unknown build date are left out.",
        remove: () => setBuilt(null, null),
      })
    }
    if (added) {
      chips.push({
        label: `Added: ${added}`,
        hint: "Only what has a section added to Lineage on these days.",
        remove: () => setAdded(null, null),
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

  if (mode === "filters") {
    return <FiltersPanel onBack={() => setMode("list")} />
  }

  return (
    <>
      <PanelHeader
        title="Sections"
        meta={
          searching
            ? `${formatCount(hits.length)} match`
            : onlyInView
              ? `${formatCount(shown.inView)} of ${formatCount(shown.all)} in view`
              : plural(shown.all, "section", "sections")
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
        {/* One area of the Help tour: the edition, the search, the filters. */}
        <div data-tour="list-tools" className="flex flex-col gap-2">
          <EditionSelect />
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
                aria-label="Search sections"
                aria-expanded={searching}
                aria-controls="pipeline-search-results"
                aria-activedescendant={
                  searching && hits.length > 0
                    ? `search-hit-${hits[activeIndex].summary.id}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
                placeholder="Search sections"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={onSearchKeyDown}
                className="pr-8 pl-8.5 [&::-webkit-search-cancel-button]:hidden"
              />
              {!searching && (
                <Kbd className="absolute top-1.5 right-1.5">/</Kbd>
              )}
            </div>
            <Button
              variant={filtered ? "secondary" : "outline"}
              size="icon"
              aria-label={filtered ? "Filters, some are on" : "Filters"}
              aria-pressed={filtered}
              onClick={() => setMode("filters")}
            >
              <Icon name="filter" />
            </Button>
          </div>
        </div>
        <StatusCounts />
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
              : `${formatCount(outside)} more ${outside === 1 ? "matches" : "match"} outside the filters.`}
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
 * The list: pipelines, then the sections that are in no pipeline, grouped by
 * the edition that first shows them. A search narrows the same list to its
 * hits and lists the sections it found under each one.
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
  const rule = useSettings((s) => s.requiredAttributes)
  const groups = useSelectionGroups()
  const selection = useStudio((s) => s.selection)
  const select = useStudio((s) => s.select)
  const selectSection = useStudio((s) => s.selectSection)
  const addToSelection = useStudio((s) => s.addToSelection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const requestFit = useStudio((s) => s.requestFit)
  const onlyInView = useStudio(listFollowsMap)
  const [descending, setDescending] = useState(false)
  /** The first-seen groups whose sections are listed. They start closed. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const attachments = useSelectionAttachments()
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

  const all = search
    ? search.hits.map((hit) => ({ summary: hit.summary, hit }))
    : visible.map((summary) => ({ summary, hit: null }))
  // Pipelines first, then what is in no pipeline, whichever way each runs.
  const inPipelines = all.filter((row) => !row.summary.unassigned)
  const loose = all.filter((row) => row.summary.unassigned)
  if (descending) {
    inPipelines.reverse()
    loose.reverse()
  }
  const rows = [...inPipelines, ...loose]
  const looseSections = loose.reduce(
    (n, row) => n + row.summary.sections.length,
    0
  )
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
  const toggleOpened = (id: string) =>
    setOpened((had) => {
      const next = new Set(had)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const allShown =
    rows.length > 0 &&
    rows.every((row) => checkedOf.get(row.summary.id) === "checked")
  const column = inPipelines.length > 0 ? "Pipeline" : "Section"
  // "Done" is about pipelines; a group in no pipeline shows its size there.
  const panelWidth = usePanelWidth()
  const columns = listColumns(panelWidth?.width ?? 0, rule)

  const renderRow = ({ summary, hit }: (typeof rows)[number]) => {
    const open = (shift = false) =>
      hit && search ? search.open(hit) : pick(summary, shift)
    const checked = checkedOf.get(summary.id) ?? "unchecked"
    const found = hit?.sections ?? []
    const name = summary.firstSeen?.label ?? summary.name
    const expanded = opened.has(summary.id)
    return (
      <Fragment key={summary.id}>
        {/* On a row of the selection the menu offers all of the selection. */}
        <AddToAgentMenu
          items={
            checked !== "unchecked"
              ? attachments
              : [{ pipelineId: summary.id, sectionIds: "all" }]
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
            onCheck={() => {
              anchor.current = summary.id
              toggleSelected(idsOf(summary))
            }}
            className={cn(hit && hit === activeHit && "bg-muted")}
            name={name}
            cells={
              <>
                {columns.detail && (
                  <>
                    <ListCell column="code" className="type-ui-mono-xs">
                      {summary.code}
                    </ListCell>
                    <ListCell column="sections">
                      {formatCount(summary.sections.length)}
                    </ListCell>
                  </>
                )}
                {columns.bar && (
                  <ListCell column="bar">
                    <StatusShareBar
                      counts={summary.statusCounts}
                      className="w-full"
                    />
                  </ListCell>
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
            progress={summaryProgress(summary)}
            status={<StatusBadge status={summary.status} />}
            {...(summary.unassigned &&
              !hit && {
                expanded,
                onToggle: () => toggleOpened(summary.id),
                toggleLabel: `${expanded ? "Hide" : "List"} the sections first seen in the ${name}`,
              })}
            onClick={(event) => open(event.shiftKey)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              // Space ticks the box; Enter selects just this row.
              if (event.key === " ") {
                event.preventDefault()
                anchor.current = summary.id
                toggleSelected(idsOf(summary))
              } else if (isActivate(event)) {
                event.preventDefault()
                open()
              } else if (
                summary.unassigned &&
                !hit &&
                ((event.key === "ArrowRight" && !expanded) ||
                  (event.key === "ArrowLeft" && expanded))
              ) {
                event.preventDefault()
                toggleOpened(summary.id)
              }
            }}
          />
        </AddToAgentMenu>
        {/* The sections of a first-seen group, once it is opened. */}
        {!hit &&
          expanded &&
          summary.sections.map((section) => {
            const openSection = () => {
              selectSection(section.id)
              requestFit(geometryBounds(section.geometry))
            }
            return (
              <AddToAgentMenu
                key={section.id}
                items={
                  selection.has(section.id)
                    ? attachments
                    : [{ pipelineId: summary.id, sectionIds: [section.id] }]
                }
              >
                <PipelineRow
                  indent
                  role="option"
                  aria-selected={selection.has(section.id)}
                  data-roving
                  tabIndex={-1}
                  selected={selection.has(section.id)}
                  checked={selection.has(section.id) ? "checked" : "unchecked"}
                  checkLabel={`Select ${sectionLabel(section)}`}
                  onCheck={() => toggleSelected([section.id])}
                  name={sectionLabel(section)}
                  cells={
                    <>
                      {columns.detail && (
                        <>
                          <ListCell column="code" className="type-ui-mono-xs">
                            {section.name === null ? null : section.code}
                          </ListCell>
                          <ListCell column="sections" />
                        </>
                      )}
                      {columns.bar && <ListCell column="bar" />}
                      {columns.attributes.map((attribute) => {
                        const value = section.claims.find(
                          (claim) => claim.attribute === attribute
                        )?.value
                        return (
                          <ListCell key={attribute} column="attribute">
                            {value ? (
                              <span className="truncate text-foreground">
                                {value}
                              </span>
                            ) : (
                              <StatusLabel status="unknown" />
                            )}
                          </ListCell>
                        )
                      })}
                    </>
                  }
                  progress={citedLabel(section, rule)}
                  status={<StatusBadge status={sectionStatus(section, rule)} />}
                  onClick={openSection}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === " ") {
                      event.preventDefault()
                      toggleSelected([section.id])
                    } else if (isActivate(event)) {
                      event.preventDefault()
                      openSection()
                    }
                  }}
                />
              </AddToAgentMenu>
            )
          })}
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
          <span className="flex items-center gap-2">
            {columns.detail && (
              <>
                <ListCell column="code">Code</ListCell>
                <ListCell column="sections">Sections</ListCell>
              </>
            )}
            {columns.bar && <ListCell column="bar">By status</ListCell>}
            {columns.attributes.map((attribute) => (
              <ListCell key={attribute} column="attribute">
                {attribute}
              </ListCell>
            ))}
            <span className="w-23 text-right">Status</span>
          </span>
        }
        selection={
          groups.length === 0
            ? "unchecked"
            : allShown
              ? "checked"
              : "indeterminate"
        }
        selectionLabel="Select everything shown"
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
        aria-label={search ? "Search results" : "Sections"}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {inPipelines.map(renderRow)}
        {loose.length > 0 && (
          <ListGroupHeader count={formatCount(looseSections)}>
            Not in a pipeline, by first seen
          </ListGroupHeader>
        )}
        {loose.map(renderRow)}
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
                  ? "Nothing in the map view. Zoom out or pan, or switch off “List follows the map” on the map."
                  : "Nothing matches the filters."}
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
