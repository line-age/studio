import { useEffect } from "react"
import { create } from "zustand"

import type { Claim, ProposedEnd, Section } from "./schema"

/*
 * A section's detail: its claims with their citations and proposals, and its
 * proposed ends in full. The sample holds every section's detail already. On
 * store's data the list has only the values, and a section's detail is read
 * when something needs it: the section opened in the right panel, a claim's
 * sources, the Agent's inbox. Read once and kept for the visit; after a write
 * Studio reads store again, and what was kept is read again too, showing the
 * old detail meanwhile, never a blank.
 *
 * Requests: ids asked for in the same frame go together, up to 200 an
 * answer, at most four answers at once. An id store leaves out of its answer
 * has failed, not still loading. An answer for an older generation never
 * replaces a newer one.
 */

export interface SectionDetail {
  claims: Claim[]
  proposedEnds: ProposedEnd[]
}

/** Reads the details of some sections; an id left out of the answer failed. */
export type DetailReader = (
  ids: readonly string[]
) => Promise<ReadonlyMap<string, SectionDetail>>

export type DetailEntry =
  | { status: "loading"; generation: number; detail?: SectionDetail }
  | { status: "ready"; generation: number; detail: SectionDetail }
  | {
      status: "failed"
      generation: number
      error: string
      detail?: SectionDetail
    }

interface DetailState {
  /** Bumped when the network is read again: kept details are then stale. */
  generation: number
  entries: Readonly<Record<string, DetailEntry>>
}

export const useDetails = create<DetailState>(() => ({
  generation: 0,
  entries: {},
}))

const BATCH = 200
const AT_ONCE = 4

let reader: DetailReader | null = null
let waiting = new Set<string>()
let scheduled = false
let running = 0
const queue: string[][] = []

/**
 * Where details come from: set each time store's network is read, null on
 * the sample. A new reader makes what is kept stale, not gone: it stays shown
 * until it is read again.
 */
export function setDetailReader(next: DetailReader | null) {
  reader = next
  waiting = new Set()
  queue.length = 0
  if (next === null) useDetails.setState({ generation: 0, entries: {} })
  else useDetails.setState((s) => ({ generation: s.generation + 1 }))
}

/**
 * The network was read again: kept details may be out of date. They stay
 * shown and are read again when next asked for.
 */
export function invalidateDetails() {
  useDetails.setState((s) => ({ generation: s.generation + 1 }))
}

/** Ask for these sections' details, unless they are current or on the way. */
export function requestDetails(ids: Iterable<string>, again = false) {
  if (!reader) return
  const { generation, entries } = useDetails.getState()
  const wanted: string[] = []
  for (const id of ids) {
    const entry = entries[id]
    const current = entry?.generation === generation
    if (current && entry.status !== "failed") continue
    if (current && entry.status === "failed" && !again) continue
    if (waiting.has(id)) continue
    wanted.push(id)
  }
  if (wanted.length === 0) return
  useDetails.setState((s) => {
    const next = { ...s.entries }
    for (const id of wanted) {
      next[id] = {
        status: "loading",
        generation: s.generation,
        ...(s.entries[id]?.detail ? { detail: s.entries[id].detail } : {}),
      }
    }
    return { entries: next }
  })
  for (const id of wanted) waiting.add(id)
  if (!scheduled) {
    scheduled = true
    // One frame later, so ids asked for together go in one request.
    setTimeout(flush, 16)
  }
}

function flush() {
  scheduled = false
  const ids = [...waiting]
  waiting = new Set()
  for (let at = 0; at < ids.length; at += BATCH) {
    queue.push(ids.slice(at, at + BATCH))
  }
  pump()
}

function pump() {
  while (running < AT_ONCE && queue.length > 0) {
    const batch = queue.shift()!
    running += 1
    void read(batch).finally(() => {
      running -= 1
      pump()
    })
  }
}

async function read(ids: string[]) {
  const from = reader
  if (!from) return
  const generation = useDetails.getState().generation
  let answer: ReadonlyMap<string, SectionDetail> | null = null
  let error = ""
  try {
    answer = await from(ids)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  if (from !== reader) return // another network since
  useDetails.setState((s) => {
    const next = { ...s.entries }
    for (const id of ids) {
      const held = s.entries[id]
      // Never put an older answer over a newer one.
      if (held && held.generation > generation) continue
      const detail = answer?.get(id)
      next[id] = detail
        ? { status: "ready", generation, detail }
        : {
            status: "failed",
            generation,
            error: answer ? "Store has no such section." : error,
            ...(held?.detail ? { detail: held.detail } : {}),
          }
    }
    return { entries: next }
  })
}

/**
 * A section's detail when Studio has it: always on the sample, on store's
 * data once read. An older one is given while a newer one is on the way.
 */
export function detailOf(
  section: Pick<Section, "id" | "claims" | "proposedEnds">
): SectionDetail | null {
  if (section.claims) {
    return { claims: section.claims, proposedEnds: section.proposedEnds }
  }
  return useDetails.getState().entries[section.id]?.detail ?? null
}

/** A section's claims when Studio has them; none while they are not read. */
export function claimsOf(
  section: Pick<Section, "id" | "claims" | "proposedEnds">
): Claim[] {
  return detailOf(section)?.claims ?? []
}

export interface DetailView {
  /** "loading" only when there is nothing to show yet. */
  status: "ready" | "loading" | "failed"
  detail: SectionDetail | null
  /** Read it again after a failure. */
  retry: () => void
}

const READY = { status: "ready" } as const

/**
 * A section's detail for a component, asked for when it is not current.
 * Shows what it has (an older detail included) and says when there is none.
 */
export function useSectionDetail(
  section: Pick<Section, "id" | "claims" | "proposedEnds"> | null | undefined
): DetailView {
  const id = section?.id ?? null
  const own = section?.claims !== undefined
  const entry = useDetails((s) => (id && !own ? s.entries[id] : undefined))
  const generation = useDetails((s) => s.generation)
  useEffect(() => {
    if (id && !own) requestDetails([id])
  }, [id, own, generation])
  if (!section) {
    return { status: "loading", detail: null, retry: noop }
  }
  if (own) {
    return {
      ...READY,
      detail: { claims: section.claims!, proposedEnds: section.proposedEnds },
      retry: noop,
    }
  }
  const retry = () => requestDetails([section.id], true)
  if (entry?.detail) {
    return {
      status: entry.status === "failed" ? "failed" : "ready",
      detail: entry.detail,
      retry,
    }
  }
  return {
    status: entry?.status === "failed" ? "failed" : "loading",
    detail: null,
    retry,
  }
}

const noop = () => undefined
