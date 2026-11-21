import { z } from "zod"

/*
 * Reading from store, the Lineage database's API. The browser never talks to
 * store itself: it asks this app's own origin at /store, and the server in
 * front (Vite in development, nginx in the container) passes the request on.
 * No token: store takes a request with none as the local person while there
 * are no users. Writing is in write.ts.
 *
 * Only the fields Studio uses are read. The name of whoever asserted or
 * reviewed a claim is in store's answer and is left out here on purpose. For a
 * link the name is read, because a link proposed by a tool is shown with the
 * tool's name; to-network.ts drops it whenever it may be a person's.
 */

const BASE = "/store"

/** Most rows store returns for one list. */
export const LIST_LIMIT = 10000

export type StoreErrorKind = "unreachable" | "refused" | "unreadable"

const messages: Record<StoreErrorKind, string> = {
  unreachable: "Store cannot be reached.",
  refused: "Store refused the request.",
  unreadable: "Store answered in a form Studio does not understand.",
}

/** Why reading from store failed, in words a person can act on. */
export class StoreError extends Error {
  readonly kind: StoreErrorKind
  readonly detail: string
  constructor(kind: StoreErrorKind, detail = "") {
    super(messages[kind])
    this.name = "StoreError"
    this.kind = kind
    this.detail = detail
  }
}

const geometry = z.object({
  type: z.string(),
  coordinates: z.unknown(),
})

/** One accepted claim with a citation, as a list row carries it: raw, unworded. */
const accepted = z.object({
  claim_id: z.string().min(1),
  value_text: z.string().nullish(),
  value_num: z.number().nullish(),
  value_unit: z.string().nullish(),
  valid_edtf: z.string().nullish(),
  created_at: z.string().nullish(),
  /** The earliest date of a map sheet cited as showing the line. */
  shown_as_of: z.string().nullish(),
  /** Another feature's claim, reached through a confirmed link. */
  inherited_from: z.string().nullish(),
})

const sectionRows = z.object({
  features: z.array(
    z.object({
      geometry: geometry.nullish(),
      properties: z.object({
        /** The section, or for a piece of it, the link that proposes the cut. */
        row_id: z.string().min(1),
        section_id: z.string().min(1),
        label: z.string().nullish(),
        /** The line the section is confirmed part of: its pipeline. */
        line_id: z.string().min(1).nullish(),
        time_end: z.string().nullish(),
        end_status: z.string().nullish(),
        accepted: z.record(z.string(), z.array(accepted)).default({}),
        candidates: z.record(z.string(), z.number()).default({}),
        shown_years: z.array(z.number().int()).default([]),
        gone_year: z.number().int().nullish(),
        created_at: z.string().nullish(),
        /** The route as traced, where a proposed cut makes the row a part of it. */
        whole_route: geometry.nullish(),
        /** The person who asserted the section's current route; never a tool. */
        traced_by: z
          .object({ id: z.string().min(1), name: z.string().min(1) })
          .nullish(),
      }),
    })
  ),
})

const citation = z.object({
  id: z.string().min(1).nullish(),
  role: z.string(),
  locator: z.string().nullish(),
  quote: z.string().nullish(),
  source_id: z.string().min(1),
  source_kind: z.string(),
  source_title: z.string().min(1),
  as_of_edtf: z.string().nullish(),
  /** The source's own identifier: for a map sheet, its scan file. */
  identifier: z.string().nullish(),
  /** From 0 to 1, when whoever cited it gave one. */
  confidence: z.number().nullish(),
  /** The source's own address on the web, where it has one. */
  url: z.string().nullish(),
  /** A captured copy's address (for example, the Wayback Machine), where there is one. */
  archive_url: z.string().nullish(),
})

const claim = z.object({
  id: z.string().min(1).nullish(),
  attribute_key: z.string().min(1),
  /** The period the claim holds for, as the source gave it. */
  valid_edtf: z.string().nullish(),
  asserted_by: z.string().nullish(),
  asserted_by_kind: z.string().nullish(),
  value_text: z.string().nullish(),
  value_num: z.number().nullish(),
  value_unit: z.string().nullish(),
  value_geom: geometry.nullish(),
  status: z.string(),
  created_at: z.string().nullish(),
  citations: z.array(citation).default([]),
  /** Set on an inherited claim: the feature it is on. */
  inherited_from: z.string().nullish(),
})

const link = z.object({
  id: z.string().min(1),
  from_feature_id: z.string().min(1),
  to_feature_id: z.string().min(1),
  relation: z.string().min(1),
  status: z.string().min(1),
  score: z.number().nullish(),
  asserted_by: z.string().nullish(),
  /** Only on the links inside a feature's answer. */
  asserted_by_name: z.string().nullish(),
  /** Store does not send this yet; read when it does. */
  asserted_by_kind: z.string().nullish(),
})

const feature = z.object({
  id: z.string().min(1),
  label: z.string().nullish(),
  created_at: z.string().nullish(),
  dates: z
    .object({ time_end: z.string().nullish() })
    .nullish()
    .transform((dates) => dates ?? null),
  claims: z.array(claim).default([]),
  /** Claims of other features reached through confirmed links (store's scope). */
  inherited_claims: z.array(claim).default([]),
  links: z.array(link).default([]),
})

export type StoreLink = z.infer<typeof link>
type RowFeature = z.infer<typeof sectionRows>["features"][number]
export type StoreSectionRow = RowFeature["properties"] & {
  geometry?: RowFeature["geometry"]
}
export type StoreAccepted = z.infer<typeof accepted>
export type StoreCitation = z.infer<typeof citation>
export type StoreClaim = z.infer<typeof claim>
export type StoreFeature = z.infer<typeof feature>

async function get<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new StoreError("unreachable", `No answer from ${BASE}${path}.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new StoreError(
      "refused",
      `${path} answered ${response.status}. Does store take a request with no token?`
    )
  }
  if ([502, 503, 504].includes(response.status)) {
    throw new StoreError(
      "unreachable",
      `${path} answered ${response.status}. Is store running, and is STORE_URL right?`
    )
  }
  if (!response.ok) {
    throw new StoreError("unreadable", `${path} answered ${response.status}.`)
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new StoreError("unreadable", `${path} did not answer with JSON.`)
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    throw new StoreError(
      "unreadable",
      `${path}\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}

/**
 * The drawn sections of one network, one row per section (or per piece where
 * a cut is proposed), each with what the list shows: its accepted claims, the
 * candidates waiting and the maps that show it. No request per section.
 */
export async function fetchSectionRows(
  network: string,
  /** Only the sections that cross this area: "minx,miny,maxx,maxy". */
  bbox: string | null = null,
  signal?: AbortSignal
): Promise<StoreSectionRow[]> {
  const query = new URLSearchParams({
    network,
    limit: String(LIST_LIMIT),
    // Store sends a row's claims only when asked; other readers get the line alone.
    include: "summary",
  })
  if (bbox !== null) query.set("bbox", bbox)
  const { features } = await get(`/sections?${query}`, sectionRows, signal)
  if (features.length >= LIST_LIMIT) {
    // Showing the first ten thousand as if it were everything would be a lie.
    throw new StoreError(
      "unreadable",
      `Store has more than ${LIST_LIMIT} section rows, more than Studio can load at once.`
    )
  }
  return features.map((f) => ({ ...f.properties, geometry: f.geometry }))
}

/** The links of one relation that touch one network, whatever their status. */
export async function fetchLinks(
  relation: string,
  network: string,
  signal?: AbortSignal
): Promise<StoreLink[]> {
  const query = new URLSearchParams({
    relation,
    network,
    limit: String(LIST_LIMIT),
  })
  const links = await get(`/links?${query}`, z.array(link), signal)
  if (links.length >= LIST_LIMIT) {
    throw new StoreError(
      "unreadable",
      `Store has more than ${LIST_LIMIT} ${relation} links, more than Studio can load at once.`
    )
  }
  return links
}

/** One bundle write: everything one source supports, in one transaction
 * (store's model/shapes.py Bundle). A claim never goes without its citation. */
export interface BundleRequest {
  sources?: {
    ref: string
    kind: string
    title: string
    external_key?: { system: string; key: string }
  }[]
  citations?: { ref: string; source: string; quote?: string }[]
  claims?: {
    ref?: string
    feature: string
    attribute: string
    value_text?: string
    value_num?: number
    value_unit?: string | null
    citations: { citation: string; role: string }[]
  }[]
}

const bundleResult = z.object({
  ids: z.record(z.string(), z.string()),
  created: z.record(z.string(), z.boolean()),
})

export type BundleResult = z.infer<typeof bundleResult>

/** Writes a bundle to store. Throws StoreError on anything but 2xx. */
export async function postBundle(bundle: BundleRequest): Promise<BundleResult> {
  let response: Response
  try {
    response = await fetch(`${BASE}/bundles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(bundle),
    })
  } catch {
    throw new StoreError("unreachable", `No answer from ${BASE}/bundles.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new StoreError(
      "refused",
      `/bundles answered ${response.status}. Check STORE_TOKEN.`
    )
  }
  if ([502, 503, 504].includes(response.status)) {
    throw new StoreError(
      "unreachable",
      `/bundles answered ${response.status}. Is store running, and is STORE_URL right?`
    )
  }
  if (!response.ok) {
    let detail = ""
    try {
      detail = await response.text()
    } catch {
      // No body to read; the status itself is detail enough.
    }
    throw new StoreError(
      "unreadable",
      `/bundles answered ${response.status}.${detail ? ` ${detail}` : ""}`
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new StoreError("unreadable", "/bundles did not answer with JSON.")
  }
  const result = bundleResult.safeParse(json)
  if (!result.success) {
    throw new StoreError(
      "unreadable",
      `/bundles\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}

/** Most features store gives in one answer. */
export const FEATURES_AT_ONCE = 200

/**
 * Features by id, in requests of up to 200, keeping the order of `ids`. An id
 * store does not hold is left out of the answer.
 */
export async function fetchFeatures(
  ids: readonly string[],
  signal?: AbortSignal
): Promise<StoreFeature[]> {
  const batches: string[][] = []
  for (let at = 0; at < ids.length; at += FEATURES_AT_ONCE) {
    batches.push(ids.slice(at, at + FEATURES_AT_ONCE))
  }
  const answers = await Promise.all(
    batches.map((batch) =>
      get(
        `/features?${new URLSearchParams({ ids: batch.join(",") })}`,
        z.array(feature),
        signal
      )
    )
  )
  return answers.flat()
}
