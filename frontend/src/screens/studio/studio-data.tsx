import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useShallow } from "zustand/react/shallow"

import { applyChange, sendChange, type Change } from "@/data/changes"

import {
  editionRows,
  inScope,
  groupSelection,
  inView,
  narrowRows,
  NO_CRITERIA,
  ownersBySection,
  search,
  summarise,
  type Scope,
  type PipelineSummary,
  type SearchHit,
  type SectionCriteria,
  type SelectionGroup,
} from "@/data/derive"
import { lookupIn, setDetailReader, useDetails } from "@/data/detail-store"
import {
  dataSource,
  detailReaderOf,
  type DataSource,
} from "@/data/load-network"
import type { Network, Section } from "@/data/schema"
import { actionKey } from "@/data/store/write"
import { statesBySection, type StatesLookup } from "@/data/us-states"

import { useSettings } from "./settings"
import { filterCriteria, filterState } from "./filters"
import { listFollowsMap, useStudio } from "./studio-store"

/*
 * The loaded network plus what the Studio screen derives from it once: the
 * rows of the list for the grouping chosen. Panels and the map read it
 * through useStudioData, never from a fixture.
 */

interface StudioData {
  network: Network
  /**
   * Read the network again, as after the Agent proposed a claim. Resolves
   * true once the new data is in, false when it could not be read (the
   * screen says so).
   */
  reload: () => Promise<boolean>
  /** Where the network comes from: the sample, or store. */
  source: DataSource
  /**
   * Make a change as the person using Studio. On store it is sent and the
   * network read again once store says it is done; on the sample it is made
   * in memory. Throws a WriteError (in words) when store refuses it. `key`
   * is the action's key, made when the person pressed it: a retry passes the
   * same one, so nothing is made twice. Resolves true when what is shown
   * reflects the change, false when it was made but store could not be read
   * again.
   */
  change: (change: Change, key?: string) => Promise<boolean>
  /** What the switch above the list shows. */
  scope: Scope
  /** Every row of the list, whatever the filters say. */
  summaries: PipelineSummary[]
  /**
   * Every section of the network once, grouped by the edition that first
   * shows it, whatever the switch says. The selection reads this: a section
   * the switch hides stays selected.
   */
  everySection: PipelineSummary[]
  /** Every pipeline with a confirmed section, whatever the switch says. */
  pipelines: PipelineSummary[]
  /** Whether the switch shows a section: in the list, on the map. */
  shows: (sectionId: string) => boolean
  /**
   * The sections the switch shows, once each, grouped the same way. The
   * counts, the filters and the map speak through this.
   */
  scoped: PipelineSummary[]
  /** The owners of each section's pipeline; a section has none of its own. */
  owners: ReadonlyMap<string, readonly string[]>
  /** The year of each edition, by id. */
  editionYears: ReadonlyMap<string, number>
  /** The US states each section runs through, worked out when first asked. */
  statesOf: StatesLookup
  summaryById: Map<string, PipelineSummary>
  sectionById: Map<string, Section>
  /**
   * Applies an edit to the loaded network, in this browser. Store, or the
   * fixture file, is never written back to from here; a store write happens
   * first, through write-edits.ts, and only once it succeeds does the edit
   * reach the network this way, so what is shown matches what was saved.
   */
  updateNetwork: (updater: (network: Network) => Network) => void
}

const StudioDataContext = createContext<StudioData | null>(null)

const noReload = () => Promise.resolve(true)

export function StudioDataProvider({
  network,
  reload = noReload,
  source = dataSource(),
  children,
}: {
  /** A promise from loadNetwork(). Suspends until it settles. */
  network: Promise<Network>
  reload?: () => Promise<boolean>
  source?: DataSource
  children: ReactNode
}) {
  const fetched = use(network)
  // The detail reader is the shown network's own, installed as it is shown:
  // a read that lost to a newer one never installs anything. Before the
  // children's effects, which ask for details.
  useLayoutEffect(() => {
    const reader = detailReaderOf(fetched)
    setDetailReader(reader?.read ?? null, reader?.of ?? "")
  }, [fetched])
  // The sample, as changed in memory since it was loaded.
  const [edited, setEdited] = useState<{ from: Network; to: Network } | null>(
    null
  )
  const loaded = edited?.from === fetched ? edited.to : fetched
  const change = useCallback(
    async (change: Change, key = actionKey()) => {
      if (source === "store") {
        await sendChange(loaded, change, key, lookupIn(useDetails.getState()))
        return reload()
      }
      setEdited({ from: fetched, to: applyChange(loaded, change, key) })
      return true
    },
    [source, loaded, fetched, reload]
  )
  const updateNetwork = useCallback(
    (updater: (network: Network) => Network) => {
      setEdited({ from: fetched, to: updater(loaded) })
    },
    [fetched, loaded]
  )
  const rule = useSettings((s) => s.requiredAttributes)
  const scope = useStudio((s) => s.scope)

  // These depend on the network only, not on the edition or the rule.
  const editionYears = useMemo(
    () => new Map(loaded.editions.map((e) => [e.id, e.year])),
    [loaded]
  )
  const statesOf = useMemo(() => statesBySection(loaded.sections), [loaded])

  const value = useMemo<StudioData>(() => {
    const everySection = editionRows(loaded, rule)
    const summaries = summarise(loaded, rule, scope)
    // What the switch shows. On Pipelines that is every section a row of the
    // list holds: a proposed pipeline is listed there, so its sections are
    // drawn and counted too (thin: they are not placed yet), and a row one
    // can click always has something on the map.
    const shown =
      scope === "all"
        ? null
        : new Set(
            scope === "pipelines"
              ? summaries.flatMap((row) => row.sections.map((s) => s.id))
              : loaded.sections
                  .filter((section) => inScope(section, scope))
                  .map((s) => s.id)
          )
    const scoped =
      shown === null
        ? everySection
        : editionRows(
            loaded,
            rule,
            loaded.sections.filter((section) => shown.has(section.id))
          )
    const pipelines = (
      scope === "unplaced" ? summarise(loaded, rule, "pipelines") : summaries
    ).filter((row) => row.kind === "pipeline")
    return {
      network: loaded,
      reload,
      source,
      change,
      scope,
      summaries,
      everySection,
      pipelines,
      scoped,
      shows: (sectionId: string) => shown === null || shown.has(sectionId),
      owners: ownersBySection(loaded),
      editionYears,
      statesOf,
      summaryById: new Map(summaries.map((s) => [s.id, s])),
      sectionById: new Map(loaded.sections.map((s) => [s.id, s])),
      updateNetwork,
    }
  }, [
    loaded,
    rule,
    scope,
    editionYears,
    statesOf,
    reload,
    source,
    change,
    updateNetwork,
  ])

  return <StudioDataContext value={value}>{children}</StudioDataContext>
}

export function useStudioData(): StudioData {
  const value = use(StudioDataContext)
  if (!value) {
    throw new Error("useStudioData must be used inside StudioDataProvider")
  }
  return value
}

/** Applies a person's edit to the loaded network; see StudioData.updateNetwork. */
export function useUpdateNetwork(): (
  updater: (network: Network) => Network
) => void {
  return useStudioData().updateNetwork
}

/**
 * What the list holds: what the status and the criteria leave and, while the
 * list follows the map, only what is in the view. A group's row is cut to
 * the sections that pass; a pipeline's row is the pipeline whole.
 */
export function useVisiblePipelines(): PipelineSummary[] {
  const { summaries } = useStudioData()
  const onlyInView = useStudio(listFollowsMap)
  const view = useStudio((s) => s.view)
  const criteria = useCriteria()
  return useMemo(
    () => narrowRows(summaries, criteria, onlyInView ? view : null),
    [summaries, criteria, onlyInView, view]
  )
}

/** What is selected, sorted into pipelines. Empty when nothing is. */
export function useSelectionGroups(): SelectionGroup[] {
  const { summaries, everySection, pipelines } = useStudioData()
  const selection = useStudio((s) => s.selection)
  const criteria = useCriteria()
  // Groups as the filters leave them, so "all of a group" means all that
  // shows. Not cut to the map view: a selection does not change on a pan.
  const rows = useMemo(
    () => narrowRows(summaries, criteria),
    [summaries, criteria]
  )
  return useMemo(() => {
    // A section goes under its pipeline, or the pipeline it is proposed for;
    // only then under the edition that first shows it, so none is named
    // twice.
    const groups = groupSelection(
      rows.filter((row) => !row.unassigned),
      selection
    )
    const held = new Set(groups.flatMap((g) => g.sections.map((s) => s.id)))
    const left = (ids: Iterable<string>) =>
      new Set([...ids].filter((id) => !held.has(id)))
    for (const group of groupSelection(
      rows.filter((row) => row.unassigned),
      left(selection)
    )) {
      groups.push(group)
      group.sections.forEach((s) => held.add(s.id))
    }
    // What the switch or the filters leave out of the list stays selected:
    // it goes under its pipeline, or under its first-seen group of the
    // whole network.
    if (left(selection).size === 0) return groups
    for (const group of groupSelection(pipelines, left(selection))) {
      groups.push(group)
      group.sections.forEach((s) => held.add(s.id))
    }
    // An edition can have sections the filters pass and sections they leave
    // out, both selected: one group for it, not two with one id.
    for (const extra of groupSelection(everySection, left(selection))) {
      const at = groups.findIndex((g) => g.summary.id === extra.summary.id)
      if (at === -1) {
        groups.push(extra)
        continue
      }
      const sections = [...groups[at].sections, ...extra.sections]
      groups[at] = {
        summary: extra.summary,
        sections,
        whole: sections.length === extra.summary.sections.length,
      }
    }
    return groups
  }, [rows, pipelines, everySection, selection])
}

/**
 * Brings a section into what is shown before it is opened from somewhere
 * that is not the list or the map (a reference in an answer, a link): where
 * the switch hides it, the switch goes to All. Otherwise it would be selected
 * with nothing in the list and no line on the map.
 */
export function useRevealSection(): (sectionId: string) => void {
  const { shows } = useStudioData()
  const setScope = useStudio((s) => s.setScope)
  return useCallback(
    (sectionId: string) => {
      if (!shows(sectionId)) setScope("all")
    },
    [shows, setScope]
  )
}

/** What a section has to satisfy: the status chosen and the filters. */
export function useCriteria(): SectionCriteria {
  // From the table in ./filters: a filter paused on Pipelines asks nothing.
  const parts = useStudio(useShallow(filterState))
  const rule = useSettings((s) => s.requiredAttributes)
  const { owners, editionYears, statesOf } = useStudioData()
  return useMemo(
    () => ({
      ...NO_CRITERIA,
      ...filterCriteria(parts),
      owners,
      editionYears,
      statesOf,
      rule,
    }),
    [parts, owners, editionYears, statesOf, rule]
  )
}

/**
 * Search hits inside the filters in force, or through the whole network when
 * the person asked for that. `outside` is how many more pipelines match
 * beyond the filters. Hits in the map view are listed first.
 */
export function useSearchHits(): { hits: SearchHit[]; outside: number } {
  const { summaries } = useStudioData()
  const visible = useVisiblePipelines()
  const query = useStudio((s) => s.query)
  const whole = useStudio((s) => s.searchPastFilters)
  const view = useStudio((s) => s.view)
  return useMemo(() => {
    const all = search(summaries, query)
    const inside = new Set(visible.map((s) => s.id))
    const hits = whole ? all : all.filter((hit) => inside.has(hit.summary.id))
    return {
      hits: [
        ...hits.filter((hit) => inView(hit.summary, view)),
        ...hits.filter((hit) => !inView(hit.summary, view)),
      ],
      outside: all.length - hits.length,
    }
  }, [summaries, visible, query, whole, view])
}
