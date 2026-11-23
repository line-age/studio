/*
 * Writing to store. The frontend's one place for store's write shapes: pure
 * builders for each change, and the POST. The Agent service writes too (its
 * proposals, through its own pipeline token); both are checked against
 * store's bundle schema (`bundle.schema.json`, from store's model).
 *
 * Studio writes as the person signed in: the gate (or, locally, the dev proxy
 * and nginx) adds their token on the way, so nothing here holds one.
 *
 * Every new row carries an external key made from the action's key, which is
 * made once when the person presses the item. Sent again (a lost answer, a
 * retry), the same bundle makes nothing new.
 */

import { studioFetch } from "../session"

const BASE = "/store"
export const SYSTEM = "studio"

/** A section as a change needs it: its id and its confirmed membership. */
export interface Placed {
  id: string
  /** The pipeline it is confirmed in, if any. */
  pipelineId: string | null
  /** Store's id of that membership, when the data has one. */
  membershipId?: string
}

/**
 * Where the sections go: an existing pipeline, a new one (with a name a
 * person gave it, or none until a source gives one), or none.
 */
export type Target =
  | { kind: "pipeline"; pipelineId: string }
  | { kind: "new"; name?: string }
  | { kind: "none" }

export interface BundleReview {
  link: string
  verdict: "confirm" | "reject"
  note?: string
}

/** A claim as a bundle carries it: a person's edit, with its citation. */
export interface BundleClaim {
  ref?: string
  /** Made from the action's key: the same press sent again makes nothing new. */
  external_key?: { system: string; key: string }
  feature: string
  attribute: string
  value_text?: string
  value_num?: number
  value_unit?: string | null
  citations: { citation: string; role: string }[]
}

export interface Bundle {
  sources?: {
    ref: string
    kind: string
    title: string
    external_key?: { system: string; key: string }
  }[]
  citations?: {
    ref: string
    source: string
    quote?: string
    external_key?: { system: string; key: string }
  }[]
  claims?: BundleClaim[]
  features?: {
    ref: string
    kind: "line"
    network: string
    external_key: { system: string; key: string }
  }[]
  reviews?: BundleReview[]
  links?: {
    ref: string
    from: string
    to: string
    relation: "part_of"
    status: "confirmed"
    external_key: { system: string; key: string }
  }[]
}

/** A key for one action, made when the person presses it. */
export function actionKey(): string {
  return crypto.randomUUID()
}

/**
 * Put `sections` in `target`, as one bundle: the memberships they leave are
 * rejected (a section is in one pipeline for its whole life, so leaving one
 * says it was wrong), then the new ones confirmed. A section already in the
 * target is left alone. Makes a pipeline, adds to one, moves and removes.
 */
export function placeBundle(
  sections: readonly Placed[],
  target: Target,
  key: string,
  network = "gas"
): Bundle {
  const to = target.kind === "pipeline" ? target.pipelineId : null
  const moving = sections.filter((s) => to === null || s.pipelineId !== to)
  const reviews: BundleReview[] = moving.flatMap((s) =>
    s.membershipId ? [{ link: s.membershipId, verdict: "reject" }] : []
  )
  const bundle: Bundle = {}
  if (target.kind === "new") {
    bundle.features = [
      {
        ref: "line",
        kind: "line",
        network,
        external_key: { system: SYSTEM, key: `${key}:line` },
      },
    ]
  }
  if (reviews.length > 0) bundle.reviews = reviews
  if (target.kind !== "none") {
    bundle.links = moving.map((s, i) => ({
      ref: `member-${i}`,
      from: s.id,
      to: target.kind === "new" ? "line" : target.pipelineId,
      relation: "part_of",
      status: "confirmed",
      external_key: { system: SYSTEM, key: `${key}:${s.id}` },
    }))
  }
  return bundle
}

/**
 * Several bundle parts as one bundle, sent in one transaction. Their refs
 * must not clash: each builder names its own.
 */
export function mergeBundles(...parts: readonly Bundle[]): Bundle {
  const merged: Bundle = {}
  for (const part of parts) {
    for (const key of Object.keys(part) as (keyof Bundle)[]) {
      const rows = part[key]
      if (!rows || rows.length === 0) continue
      ;(merged[key] as unknown[]) = [
        ...((merged[key] as unknown[]) ?? []),
        ...rows,
      ]
    }
  }
  return merged
}

/**
 * Confirm or reject proposed memberships, as one bundle: a proposed pipeline
 * is decided whole. The caller leaves out, for a confirm, the sections
 * already in another pipeline.
 */
export function decideMembershipsBundle(
  linkIds: readonly string[],
  verdict: "confirm" | "reject"
): Bundle {
  return { reviews: linkIds.map((link) => ({ link, verdict })) }
}

export type WriteErrorKind =
  "unreachable" | "refused" | "decided" | "placed" | "invalid"

/** What every failed save says first (Figma `471:17432`). */
export const NOT_SAVED = "Couldn't save. Nothing was changed."

/** Why, in plain words: nothing a person reads names store. */
const reasons: Record<WriteErrorKind, string> = {
  unreachable: "The connection dropped. Try again.",
  refused: "You are not allowed to make this change.",
  decided: "Someone has already decided this.",
  placed: "A section is already in another pipeline.",
  invalid: "The change was not accepted.",
}

/** Why a write failed, in words a person can act on. */
export class WriteError extends Error {
  readonly kind: WriteErrorKind
  /** The reason in plain words, without the "Couldn't save" before it. */
  readonly reason: string
  /** The refusal's own words, when it gave some (a value's rule). */
  readonly detail: string
  constructor(kind: WriteErrorKind, detail = "") {
    super(`${NOT_SAVED} ${reasons[kind]}`)
    this.name = "WriteError"
    this.kind = kind
    this.reason = reasons[kind]
    this.detail = detail
  }
}

/** What a refusal from store means, from its status and its words. */
export function writeErrorKind(status: number, detail: string): WriteErrorKind {
  if (status === 401 || status === 403) return "refused"
  if (status === 409)
    return /already in a pipeline/.test(detail) ? "placed" : "decided"
  if ([502, 503, 504].includes(status)) return "unreachable"
  return "invalid"
}

export async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await studioFetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new WriteError("unreachable", `No answer from ${BASE}${path}.`)
  }
  let json: unknown = null
  try {
    json = await response.json()
  } catch {
    // An answer without a body; the status says enough.
  }
  if (!response.ok) {
    const detail =
      json && typeof json === "object" && "detail" in json
        ? String((json as { detail: unknown }).detail)
        : ""
    throw new WriteError(writeErrorKind(response.status, detail), detail)
  }
  return json
}

/** The claim ids a bundle's answer gives for its claim refs ("claim-0"…). */
export function claimIdsOf(answer: unknown): string[] {
  const ids =
    answer && typeof answer === "object" && "ids" in answer
      ? (answer as { ids: Record<string, unknown> }).ids
      : {}
  return Object.entries(ids ?? {})
    .filter(([ref]) => ref.startsWith("claim-"))
    .map(([, id]) => String(id))
}

export function postBundle(bundle: Bundle): Promise<unknown> {
  return post("/bundles", bundle)
}

export function reviewLink(
  linkId: string,
  verdict: "confirm" | "reject"
): Promise<unknown> {
  return post(`/links/${encodeURIComponent(linkId)}/reviews`, { verdict })
}

export function reviewClaim(
  claimId: string,
  verdict: "accept" | "reject"
): Promise<unknown> {
  return post(`/claims/${encodeURIComponent(claimId)}/reviews`, { verdict })
}
