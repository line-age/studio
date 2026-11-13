import { z } from "zod"

/*
 * Reading from store, the Lineage database's API. The browser never talks to
 * store itself: it asks this app's own origin at /store, and the server in
 * front (Vite in development, nginx in the container) passes the request on
 * with the token. So no token is ever in this code or in the bundle.
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
  refused: "Store refused the token.",
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

const sectionRows = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        section_id: z.string().min(1),
        /** The line the section is confirmed part of: its pipeline. */
        line_id: z.string().min(1).nullish(),
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
  links: z.array(link).default([]),
})

export type StoreLink = z.infer<typeof link>
export type StoreSectionRow = z.infer<
  typeof sectionRows
>["features"][number]["properties"]
export type StoreCitation = z.infer<typeof citation>
export type StoreClaim = z.infer<typeof claim>
export type StoreFeature = z.infer<typeof feature>

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
    })
  } catch {
    throw new StoreError("unreachable", `No answer from ${BASE}${path}.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new StoreError(
      "refused",
      `${path} answered ${response.status}. Check STORE_TOKEN.`
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

/** The drawn sections of one network: which exist, and their pipeline. */
export async function fetchSectionRows(
  network: string,
  /** Only the sections that cross this area: "minx,miny,maxx,maxy". */
  bbox: string | null = null
): Promise<StoreSectionRow[]> {
  const query = new URLSearchParams({ network, limit: String(LIST_LIMIT) })
  if (bbox !== null) query.set("bbox", bbox)
  const { features } = await get(`/sections?${query}`, sectionRows)
  if (features.length >= LIST_LIMIT) {
    // Showing the first ten thousand as if it were everything would be a lie.
    throw new StoreError(
      "unreadable",
      `Store has more than ${LIST_LIMIT} section rows, more than Studio can load at once.`
    )
  }
  return features.map((f) => f.properties)
}

/**
 * The links of one relation, whatever their status. Store has no filter by
 * network here, so the caller keeps the ones that touch its sections.
 */
export async function fetchLinks(relation: string): Promise<StoreLink[]> {
  const query = new URLSearchParams({ relation, limit: String(LIST_LIMIT) })
  const links = await get(`/links?${query}`, z.array(link))
  if (links.length >= LIST_LIMIT) {
    throw new StoreError(
      "unreadable",
      `Store has more than ${LIST_LIMIT} ${relation} links, more than Studio can load at once.`
    )
  }
  return links
}

export function fetchFeature(id: string): Promise<StoreFeature> {
  return get(`/features/${encodeURIComponent(id)}`, feature)
}

/** Fetch every feature, a few at a time, keeping the order of `ids`. */
export async function fetchFeatures(
  ids: readonly string[],
  atOnce = 8
): Promise<StoreFeature[]> {
  const out = new Array<StoreFeature>(ids.length)
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const at = next
      next += 1
      out[at] = await fetchFeature(ids[at])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(atOnce, ids.length) }, worker)
  )
  return out
}
