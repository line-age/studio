/*
 * Writing to store. The frontend's one place for store's write shapes: pure
 * builders for each change, and the POST. The Agent service writes too (its
 * proposals, through its own pipeline token); both are checked against
 * store's bundle schema (`bundle.schema.json`, from store's model).
 *
 * Studio writes as the person using it. In development store takes a request
 * with no token as the local person, so nothing here holds a token.
 *
 * Every new row carries an external key made from the action's key, which is
 * made once when the person presses the item. Sent again (a lost answer, a
 * retry), the same bundle makes nothing new.
 */

const BASE = "/store"
const SYSTEM = "studio"

/** A section as a change needs it: its id and its confirmed membership. */
export interface Placed {
  id: string
  /** The pipeline it is confirmed in, if any. */
  pipelineId: string | null
  /** Store's id of that membership, when the data has one. */
  membershipId?: string
}

/** Where the sections go: an existing pipeline, a new one, or none. */
export type Target =
  { kind: "pipeline"; pipelineId: string } | { kind: "new" } | { kind: "none" }

export interface BundleReview {
  link: string
  verdict: "confirm" | "reject"
  note?: string
}

export interface Bundle {
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
 * target is left alone. Makes a pipeline, adds to one, moves and takes out.
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

const messages: Record<WriteErrorKind, string> = {
  unreachable: "Store cannot be reached. Nothing was changed.",
  refused: "Store refused this change. Nothing was changed.",
  decided: "Someone has already decided this. Nothing was changed.",
  placed: "A section is already in a pipeline. Nothing was changed.",
  invalid: "Store did not accept this change. Nothing was changed.",
}

/** Why a write failed, in words a person can act on. */
export class WriteError extends Error {
  readonly kind: WriteErrorKind
  readonly detail: string
  constructor(kind: WriteErrorKind, detail = "") {
    super(messages[kind])
    this.name = "WriteError"
    this.kind = kind
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
    response = await fetch(`${BASE}${path}`, {
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
