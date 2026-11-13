import { createContext, use, useMemo, type ReactNode } from "react"

import {
  groupSelection,
  inView,
  search,
  summarise,
  visiblePipelines,
  type PipelineSummary,
  type SearchHit,
  type SectionCriteria,
  type SelectionGroup,
} from "@/data/derive"
import type { Edition, Network, Section } from "@/data/schema"

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
  /** Every pipeline of the edition, whatever the filters say. */
  summaries: PipelineSummary[]
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

  const value = useMemo<StudioData>(() => {
    const edition =
      loaded.editions.find((e) => e.id === editionId) ?? latestEdition(loaded)
    const summaries = summarise(loaded, edition.id, rule)
    return {
      network: loaded,
      edition,
      summaries,
      summaryById: new Map(summaries.map((s) => [s.id, s])),
      sectionById: new Map(loaded.sections.map((s) => [s.id, s])),
    }
  }, [loaded, editionId, rule])

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
  const { summaries } = useStudioData()
  const selection = useStudio((s) => s.selection)
  return useMemo(
    () => groupSelection(summaries, selection),
    [summaries, selection]
  )
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
  const rule = useSettings((s) => s.requiredAttributes)
  return useMemo(
    () => ({
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
