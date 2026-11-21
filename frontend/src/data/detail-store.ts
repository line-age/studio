import { useEffect, useMemo } from "react"
import { create } from "zustand"

import { ownDetail, type DetailLookup } from "./detail"
import type { Section, SectionDetail } from "./schema"

/*
 * A section's detail: its claims with their citations and proposals, and its
 * proposed ends in full. The sample holds every section's detail already. On
 * store's data the list has only the values, and a section's detail is read
 * when something needs it: the section opened in the right panel, a claim's
 * sources, the Agent's inbox, a question about it. Read once and kept for the
 * visit; after a write Studio reads store again, and what was kept is read
 * again too, showing the old detail meanwhile, never a blank.
 *
 * Requests: ids asked for in the same frame go together, up to 200 an answer,
 * at most four answers at once; a single section asked for on its own goes
 * ahead of a long list. A read that takes too long fails and can be tried
 * again. An id store leaves out of its answer has failed, not still loading.
 *
 * Everything a reader has asked for belongs to it: a new reader (the network
 * read again) stops the old one's reads, and nothing it answers later is kept.
 */

export type { SectionDetail }

/** One section's detail, or why it could not be read. */
export type DetailAnswer = ReadonlyMap<
  string,
  SectionDetail | { error: string }
>

/** Reads the details of some sections; an id left out of the answer failed. */
export type DetailReader = (
  ids: readonly string[],
  signal: AbortSignal
) => Promise<DetailAnswer>

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
  /** Bumped with each reader: details kept from before are then stale. */
  generation: number
  entries: Readonly<Record<string, DetailEntry>>
}

export const useDetails = create<DetailState>(() => ({
  generation: 0,
  entries: {},
}))

const BATCH = 200
const AT_ONCE = 4
/** A read that has not answered in this long fails and can be tried again. */
export const READ_TIMEOUT_MS = 20_000

/** One reader and everything it has under way. */
interface Lane {
  read: DetailReader
  /** Which network (and area) it reads: details of another are not kept. */
  of: string
  timeoutMs: number
  stop: AbortController
  waiting: Set<string>
  urgent: Set<string>
  scheduled: boolean
  running: number
  queue: string[][]
}

let lane: Lane | null = null

/**
 * Where details come from: set when a network is shown, null on the sample.
 * `of` names the network read. The same network read again makes kept details
 * stale, not gone: they stay shown until read again. Another network, or none,
 * drops them.
 */
export function setDetailReader(
  read: DetailReader | null,
  of = "",
  timeoutMs = READ_TIMEOUT_MS
) {
  const before = lane
  lane?.stop.abort()
  lane = read
    ? {
        read,
        of,
        timeoutMs,
        stop: new AbortController(),
        waiting: new Set(),
        urgent: new Set(),
        scheduled: false,
        running: 0,
        queue: [],
      }
    : null
  if (!read || before?.of !== of) {
    useDetails.setState((s) => ({ generation: s.generation + 1, entries: {} }))
  } else {
    useDetails.setState((s) => ({ generation: s.generation + 1 }))
  }
}

/**
 * Ask for these sections' details, unless they are current or on the way.
 * `again`: read them even if current (a retry). `urgent`: ahead of what is
 * already queued.
 */
export function requestDetails(
  ids: Iterable<string>,
  { again = false, urgent = false }: { again?: boolean; urgent?: boolean } = {}
) {
  const current = lane
  if (!current) return
  const { generation, entries } = useDetails.getState()
  const wanted: string[] = []
  for (const id of ids) {
    const entry = entries[id]
    if (
      entry?.generation === generation &&
      (entry.status === "loading" || !again)
    )
      continue
    if (current.waiting.has(id) || current.urgent.has(id)) continue
    wanted.push(id)
  }
  if (wanted.length === 0) return
  useDetails.setState((s) => {
    const next = { ...s.entries }
    for (const id of wanted) {
      const kept = s.entries[id]?.detail
      next[id] = {
        status: "loading",
        generation: s.generation,
        ...(kept ? { detail: kept } : {}),
      }
    }
    return { entries: next }
  })
  for (const id of wanted) (urgent ? current.urgent : current.waiting).add(id)
  if (!current.scheduled) {
    current.scheduled = true
    // One frame later, so ids asked for together go in one request.
    setTimeout(() => flush(current), 16)
  }
}

function flush(at: Lane) {
  at.scheduled = false
  if (at !== lane) return
  const batches = (ids: string[]) => {
    const out: string[][] = []
    for (let i = 0; i < ids.length; i += BATCH)
      out.push(ids.slice(i, i + BATCH))
    return out
  }
  at.queue.unshift(...batches([...at.urgent]))
  at.queue.push(...batches([...at.waiting]))
  at.urgent = new Set()
  at.waiting = new Set()
  pump(at)
}

function pump(at: Lane) {
  while (at === lane && at.running < AT_ONCE && at.queue.length > 0) {
    const batch = at.queue.shift()!
    at.running += 1
    void read(at, batch).finally(() => {
      at.running -= 1
      pump(at)
    })
  }
}

async function read(at: Lane, ids: string[]) {
  const generation = useDetails.getState().generation
  const signal = AbortSignal.any([
    at.stop.signal,
    AbortSignal.timeout(at.timeoutMs),
  ])
  let answer: DetailAnswer | null = null
  let error = ""
  try {
    answer = await at.read(ids, signal)
  } catch (e) {
    error =
      (e as { name?: unknown } | null)?.name === "TimeoutError"
        ? "Store took too long to answer."
        : e instanceof Error
          ? e.message
          : String(e)
  }
  if (at !== lane) return // another reader since: this answer is not kept
  useDetails.setState((s) => {
    const next = { ...s.entries }
    for (const id of ids) {
      const held = s.entries[id]
      // Never put an older answer over a newer one.
      if (held && held.generation > generation) continue
      const got = answer?.get(id)
      next[id] =
        got && "claims" in got
          ? { status: "ready", generation, detail: got }
          : {
              status: "failed",
              generation,
              error:
                got?.error ?? (answer ? "Store has no such section." : error),
              ...(held?.detail ? { detail: held.detail } : {}),
            }
    }
    return { entries: next }
  })
}

export { ownDetail, type DetailLookup }

/**
 * Details from these entries: on store's data what was read, an older one
 * included while a newer is on the way. `currentOnly`: none that is stale or
 * failed.
 */
export function lookupIn(
  { entries, generation }: DetailState,
  currentOnly = false
): DetailLookup {
  return (section) => {
    if (section.claims) {
      return { claims: section.claims, proposedEnds: section.proposedEnds }
    }
    const entry = entries[section.id]
    if (!entry?.detail) return null
    if (
      currentOnly &&
      (entry.status !== "ready" || entry.generation !== generation)
    )
      return null
    return entry.detail
  }
}

/** A lookup that follows the details as they are read. */
export function useDetailLookup(currentOnly = false): DetailLookup {
  const entries = useDetails((s) => s.entries)
  const generation = useDetails((s) => s.generation)
  return useMemo(
    () => lookupIn({ entries, generation }, currentOnly),
    [entries, generation, currentOnly]
  )
}

/**
 * Reads these sections' details if they are not current, and waits for them,
 * at most `ms`. For what must carry ids, as a question sent to the Agent.
 */
export function ensureDetails(
  ids: readonly string[],
  ms = 5000
): Promise<DetailLookup> {
  requestDetails(ids, { urgent: true })
  const settled = (s: DetailState) =>
    ids.every((id) => {
      const e = s.entries[id]
      return !lane || !e || e.status !== "loading"
    })
  return new Promise((resolve) => {
    const done = () => {
      unsubscribe()
      clearTimeout(timer)
      resolve(lookupIn(useDetails.getState()))
    }
    const unsubscribe = useDetails.subscribe((s) => {
      if (settled(s)) done()
    })
    const timer = setTimeout(done, ms)
    if (settled(useDetails.getState())) done()
  })
}

export interface DetailView {
  /** "loading" only when there is nothing to show yet. */
  status: "ready" | "loading" | "failed"
  detail: SectionDetail | null
  /** Read it again after a failure. */
  retry: () => void
}

/**
 * A section's detail for a component, asked for when it is not current.
 * Shows what it has (an older detail included) and says when there is none.
 */
export function useSectionDetail(
  section: Pick<Section, "id" | "claims" | "proposedEnds"> | null | undefined
): DetailView {
  const id = section?.id ?? null
  const ownClaims = section?.claims
  const ownEnds = section?.proposedEnds
  const entry = useDetails((s) =>
    id && !ownClaims ? s.entries[id] : undefined
  )
  const generation = useDetails((s) => s.generation)
  useEffect(() => {
    if (id && !ownClaims) requestDetails([id], { urgent: true })
  }, [id, ownClaims, generation])
  const own = useMemo(
    () =>
      ownClaims && ownEnds
        ? { claims: ownClaims, proposedEnds: ownEnds }
        : null,
    [ownClaims, ownEnds]
  )
  if (!section) return { status: "loading", detail: null, retry: noop }
  if (own) return { status: "ready", detail: own, retry: noop }
  const retry = () =>
    requestDetails([section.id], { again: true, urgent: true })
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
