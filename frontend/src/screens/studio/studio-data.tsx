import { createContext, use, useMemo, type ReactNode } from "react"

import {
  inView,
  search,
  summarise,
  visiblePipelines,
  type PipelineSummary,
  type SearchHit,
} from "@/data/derive"
import type { Edition, Network, Section } from "@/data/schema"

import { useStudio } from "./studio-store"

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

  const value = useMemo<StudioData>(() => {
    const edition =
      loaded.editions.find((e) => e.id === editionId) ?? latestEdition(loaded)
    const summaries = summarise(loaded, edition.id)
    return {
      network: loaded,
      edition,
      summaries,
      summaryById: new Map(summaries.map((s) => [s.id, s])),
      sectionById: new Map(loaded.sections.map((s) => [s.id, s])),
    }
  }, [loaded, editionId])

  return <StudioDataContext value={value}>{children}</StudioDataContext>
}

export function useStudioData(): StudioData {
  const value = use(StudioDataContext)
  if (!value) {
    throw new Error("useStudioData must be used inside StudioDataProvider")
  }
  return value
}

/** The pipelines the filters leave: the Show choice and, if on, the map view. */
export function useVisiblePipelines(): PipelineSummary[] {
  const { summaries } = useStudioData()
  const show = useStudio((s) => s.show)
  const onlyInView = useStudio((s) => s.onlyInView)
  const view = useStudio((s) => s.view)
  return useMemo(
    () => visiblePipelines(summaries, { show, view: onlyInView ? view : null }),
    [summaries, show, onlyInView, view]
  )
}

/**
 * Search hits across the whole edition, whatever the other filters say.
 * Hits in the map view come first, which is also the order they are listed.
 */
export function useSearchHits(): SearchHit[] {
  const { summaries } = useStudioData()
  const query = useStudio((s) => s.query)
  const view = useStudio((s) => s.view)
  return useMemo(() => {
    const hits = search(summaries, query)
    return [
      ...hits.filter((hit) => inView(hit.summary, view)),
      ...hits.filter((hit) => !inView(hit.summary, view)),
    ]
  }, [summaries, query, view])
}
