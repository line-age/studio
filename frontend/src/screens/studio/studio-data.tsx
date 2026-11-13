import { createContext, use, useMemo, type ReactNode } from "react"

import {
  defaultList,
  groupSelection,
  inView,
  ownersBySection,
  search,
  summarise,
  visiblePipelines,
  type ListKind,
  type PipelineSummary,
  type SearchHit,
  type SectionCriteria,
  type SelectionGroup,
} from "@/data/derive"
import type { Edition, Network, Section } from "@/data/schema"
import { statesBySection, type StatesLookup } from "@/data/us-states"

import { useSettings } from "./settings"
import { listFollowsMap, useStudio } from "./studio-store"

/*
 * The loaded network plus what the Studio screen derives from it once: the
 * edition in force and one summary per pipeline. Panels and the map read it
 * through useStudioData, never from a fixture.
 */

interface StudioData {
  network: Network
  edition: Edition
  /** The list showing: the pipelines, or every section. */
  list: ListKind
  /** Every row of that list for the edition, whatever the filters say. */
  summaries: PipelineSummary[]
  /**
   * Every section of the edition, grouped by the edition that first shows
   * it: the rows of the Sections list. Counts, filters and the map speak for
   * the whole edition through this, whichever list is showing.
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
}

const StudioDataContext = createContext<StudioData | null>(null)

function latestEdition(network: Network): Edition {
  return network.editions.reduce((a, b) => (b.year > a.year ? b : a))
}

export function StudioDataProvider({
  network,
  children,
}: {
  /** A promise from loadNetwork(). Suspends until it settles. */
  network: Promise<Network>
  children: ReactNode
}) {
  const loaded = use(network)
  const editionId = useStudio((s) => s.editionId)
  const rule = useSettings((s) => s.requiredAttributes)
  const chosen = useStudio((s) => s.list)

  // These depend on the network only, not on the edition or the rule.
  const editionYears = useMemo(
    () => new Map(loaded.editions.map((e) => [e.id, e.year])),
    [loaded]
  )
  const statesOf = useMemo(() => statesBySection(loaded.sections), [loaded])

  const value = useMemo<StudioData>(() => {
    const edition =
      loaded.editions.find((e) => e.id === editionId) ?? latestEdition(loaded)
    const list = chosen ?? defaultList(loaded)
    const everySection = summarise(loaded, edition.id, rule, "sections")
    const summaries =
      list === "sections"
        ? everySection
        : summarise(loaded, edition.id, rule, list)
    return {
      network: loaded,
      edition,
      list,
      summaries,
      everySection,
      owners: ownersBySection(loaded),
      editionYears,
      statesOf,
      summaryById: new Map(summaries.map((s) => [s.id, s])),
      sectionById: new Map(loaded.sections.map((s) => [s.id, s])),
    }
  }, [loaded, editionId, rule, chosen, editionYears, statesOf])

  return <StudioDataContext value={value}>{children}</StudioDataContext>
}

export function useStudioData(): StudioData {
  const value = use(StudioDataContext)
  if (!value) {
    throw new Error("useStudioData must be used inside StudioDataProvider")
  }
  return value
}

/**
 * What the list holds: what the status and the criteria leave and, while the
 * list follows the map, only what is in the view.
 */
export function useVisiblePipelines(): PipelineSummary[] {
  const { summaries } = useStudioData()
  const onlyInView = useStudio(listFollowsMap)
  const view = useStudio((s) => s.view)
  const criteria = useCriteria()
  return useMemo(
    () =>
      visiblePipelines(summaries, {
        ...criteria,
        view: onlyInView ? view : null,
      }),
    [summaries, criteria, onlyInView, view]
  )
}

/** What is selected, sorted into pipelines. Empty when nothing is. */
export function useSelectionGroups(): SelectionGroup[] {
  const { summaries, everySection, list } = useStudioData()
  const selection = useStudio((s) => s.selection)
  return useMemo(() => {
    const groups = groupSelection(summaries, selection)
    if (list === "sections") return groups
    // A section in no pipeline, picked on the map while the Pipelines list
    // is showing, is in none of its rows: it goes under its first-seen group.
    const held = new Set(groups.flatMap((g) => g.sections.map((s) => s.id)))
    const rest = new Set([...selection].filter((id) => !held.has(id)))
    return rest.size === 0
      ? groups
      : [...groups, ...groupSelection(everySection, rest)]
  }, [summaries, everySection, list, selection])
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
 * Search hits inside the filters in force, or through the whole edition when
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
