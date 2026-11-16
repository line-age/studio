import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { applyChange, sendChange, type Change } from "@/data/changes"

import {
  defaultList,
  groupSelection,
  inView,
  narrowRows,
  ownersBySection,
  search,
  summarise,
  type ListKind,
  type PipelineSummary,
  type SearchHit,
  type SectionCriteria,
  type SelectionGroup,
} from "@/data/derive"
import { dataSource, type DataSource } from "@/data/load-network"
import type { Network, Section } from "@/data/schema"
import { actionKey } from "@/data/store/write"
import { statesBySection, type StatesLookup } from "@/data/us-states"

import { useSettings } from "./settings"
import { listFollowsMap, useStudio } from "./studio-store"

/*
 * The loaded network plus what the Studio screen derives from it once: the
 * rows of the list for the grouping chosen. Panels and the map read it
 * through useStudioData, never from a fixture.
 */

interface StudioData {
  network: Network
  /** Read the network again, as after the Agent proposed a claim. */
  reload: () => void
  /** Where the network comes from: the sample, or store. */
  source: DataSource
  /**
   * Make a change as the person using Studio. On store it is sent and the
   * network read again once store says it is done; on the sample it is made
   * in memory. Throws a WriteError (in words) when store refuses it. `key`
   * is the action's key, made when the person pressed it: a retry passes the
   * same one, so nothing is made twice.
   */
  change: (change: Change, key?: string) => Promise<void>
  /** How the list is grouped: by pipeline, or by edition. */
  list: ListKind
  /** Every row of the list, whatever the filters say. */
  summaries: PipelineSummary[]
  /**
   * Every section once, grouped by the edition that first shows it. Counts,
   * filters and the map speak for the whole network through this, however
   * the list is grouped.
   */
  everySection: PipelineSummary[]
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

const noReload = () => undefined

export function StudioDataProvider({
  network,
  reload = noReload,
  source = dataSource(),
  children,
}: {
  /** A promise from loadNetwork(). Suspends until it settles. */
  network: Promise<Network>
  reload?: () => void
  source?: DataSource
  children: ReactNode
}) {
  const fetched = use(network)
  // The sample, as changed in memory since it was loaded.
  const [edited, setEdited] = useState<{ from: Network; to: Network } | null>(
    null
  )
  const loaded = edited?.from === fetched ? edited.to : fetched
  const change = useCallback(
    async (change: Change, key = actionKey()) => {
      if (source === "store") {
        await sendChange(loaded, change, key)
        reload()
        return
      }
      setEdited({ from: fetched, to: applyChange(loaded, change, key) })
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
  const chosen = useStudio((s) => s.list)

  // These depend on the network only, not on the edition or the rule.
  const editionYears = useMemo(
    () => new Map(loaded.editions.map((e) => [e.id, e.year])),
    [loaded]
  )
  const statesOf = useMemo(() => statesBySection(loaded.sections), [loaded])

  const value = useMemo<StudioData>(() => {
    const list = chosen ?? defaultList(loaded)
    const everySection = summarise(loaded, rule, "sections")
    const summaries =
      list === "sections" ? everySection : summarise(loaded, rule, list)
    return {
      network: loaded,
      reload,
      source,
      change,
      list,
      summaries,
      everySection,
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
    chosen,
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
  const { summaries, everySection, list } = useStudioData()
  const selection = useStudio((s) => s.selection)
  const criteria = useCriteria()
  // Groups as the filters leave them, so "all of a group" means all that
  // shows. Not cut to the map view: a selection does not change on a pan.
  const rows = useMemo(
    () => narrowRows(summaries, criteria),
    [summaries, criteria]
  )
  return useMemo(() => {
    const groups = groupSelection(rows, selection)
    if (list === "sections") return groups
    // Grouped by pipeline, a section whose pipeline the data does not list
    // is in no row: it goes under its first-seen group.
    const held = new Set(groups.flatMap((g) => g.sections.map((s) => s.id)))
    const rest = new Set([...selection].filter((id) => !held.has(id)))
    return rest.size === 0
      ? groups
      : [...groups, ...groupSelection(everySection, rest)]
  }, [rows, everySection, list, selection])
}

/** What a section has to satisfy: the status chosen and the filters. */
export function useCriteria(): SectionCriteria {
  const unknownIn = useStudio((s) => s.unknownIn)
  const companies = useStudio((s) => s.companies)
  const builtFrom = useStudio((s) => s.builtFrom)
  const builtTo = useStudio((s) => s.builtTo)
  const addedFrom = useStudio((s) => s.addedFrom)
  const addedTo = useStudio((s) => s.addedTo)
  const status = useStudio((s) => s.status)
  const needsDecision = useStudio((s) => s.needsDecisionOnly)
  const memberships = useStudio((s) => s.memberships)
  const firstSeenFrom = useStudio((s) => s.firstSeenFrom)
  const firstSeenTo = useStudio((s) => s.firstSeenTo)
  const changedOnly = useStudio((s) => s.changedOnly)
  const diameters = useStudio((s) => s.diameters)
  const states = useStudio((s) => s.states)
  const rule = useSettings((s) => s.requiredAttributes)
  const { owners, editionYears, statesOf } = useStudioData()
  return useMemo(
    () => ({
      owners,
      editionYears,
      statesOf,
      memberships,
      firstSeenFrom,
      firstSeenTo,
      changedOnly,
      diameters,
      states,
      unknownIn,
      companies,
      builtFrom,
      builtTo,
      addedFrom,
      addedTo,
      status,
      needsDecision,
      rule,
    }),
    [
      owners,
      editionYears,
      statesOf,
      memberships,
      firstSeenFrom,
      firstSeenTo,
      changedOnly,
      diameters,
      states,
      unknownIn,
      companies,
      builtFrom,
      builtTo,
      addedFrom,
      addedTo,
      status,
      needsDecision,
      rule,
    ]
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
  const whole = useStudio((s) => s.searchWholeEdition)
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
