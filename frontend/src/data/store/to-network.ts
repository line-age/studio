import { parseNetwork, type Network } from "../schema"
import {
  StoreError,
  type StoreCitation,
  type StoreClaim,
  type StoreFeature,
  type StoreSectionRow,
} from "./client"

/*
 * Store's answers turned into the Network the screen draws. Pure: no fetch.
 *
 * What store says and what Studio shows:
 *  - A map sheet cited anywhere is an edition; its year is the sheet's date.
 *  - The sheet a section's route is cited to is where it is first seen. The
 *    section is in that edition and every later one. That year is when a map
 *    first shows the line, not when it was built: Build date stays Unknown.
 *  - Only accepted claims are facts. A candidate claim is a proposal. No
 *    accepted claim means Unknown; nothing is filled in.
 *  - A section ends only when its end is confirmed. Ends that store merely
 *    proposes (from unconfirmed removals) are ignored, so the geometry is the
 *    route as traced, not store's drawn rows with the proposed cuts taken out.
 *  - A section confirmed part of a line is in that pipeline. None is yet.
 */

type InputNetwork = Parameters<typeof parseNetwork>[0]

interface Citation {
  source: string
  locator?: string
  quote?: string
}

interface Claim {
  attribute: string
  value: string | null
  citations: Citation[]
  proposals: { value: string; citation: Citation }[]
}

/** The facts Studio lists for a section, in order, and store's key for each. */
const FACTS: { attribute: string; key: string | null }[] = [
  { attribute: "Owner", key: "owner" },
  { attribute: "Diameter", key: "diameter" },
  { attribute: "Status", key: "status" },
  { attribute: "First seen", key: null },
  { attribute: "Last seen", key: null },
  { attribute: "Build date", key: null },
  { attribute: "Geometry", key: "route" },
]

const yearOf = (edtf: string | null | undefined): number | null => {
  const year = edtf?.match(/\d{4}/)?.[0]
  return year ? Number(year) : null
}

const shortId = (id: string) => id.slice(0, 8)

const toCitation = (c: StoreCitation): Citation => ({
  source: c.source_title,
  ...(c.locator ? { locator: c.locator } : {}),
  ...(c.quote ? { quote: c.quote } : {}),
})

/** A claim's value as words; null when it has none Studio can show. */
function valueOf(claim: StoreClaim): string | null {
  if (claim.attribute_key === "route") {
    return claim.value_geom ? "Traced line" : null
  }
  if (claim.value_num !== null && claim.value_num !== undefined) {
    return [String(claim.value_num), claim.value_unit].filter(Boolean).join(" ")
  }
  return claim.value_text ? claim.value_text : null
}

const newest = (claims: StoreClaim[]) =>
  [...claims].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )

/** [x, y] pairs only: store may carry a third ordinate, the map does not. */
function lineGeometry(geom: unknown, featureId: string) {
  const g = geom as { type?: string; coordinates?: unknown } | null
  const flat = (line: unknown) =>
    (line as number[][]).map(([x, y]) => [x, y] as [number, number])
  try {
    if (g?.type === "LineString") {
      return { type: "LineString" as const, coordinates: flat(g.coordinates) }
    }
    if (g?.type === "MultiLineString") {
      return {
        type: "MultiLineString" as const,
        coordinates: (g.coordinates as unknown[]).map(flat),
      }
    }
  } catch {
    // Falls through to the error below.
  }
  throw new StoreError(
    "unreadable",
    `Section ${featureId}: its route is not a line Studio can draw.`
  )
}

export function toNetwork(
  name: string,
  rows: readonly StoreSectionRow[],
  features: readonly StoreFeature[]
): Network {
  // Editions: every map sheet a claim cites.
  const sheets = new Map<string, { id: string; year: number }>()
  for (const feature of features) {
    for (const claim of feature.claims) {
      for (const c of claim.citations) {
        const year = yearOf(c.as_of_edtf)
        if (c.source_kind !== "map_sheet" || year === null) continue
        sheets.set(c.source_id, { id: `ed-${c.source_id}`, year })
      }
    }
  }
  const editions = [...sheets.values()]
    .sort((a, b) => a.year - b.year)
    .map((e) => ({ ...e, label: `${e.year} edition` }))
  if (editions.length === 0) {
    throw new StoreError(
      "unreadable",
      features.length === 0
        ? "Store has no sections for this network. Has the import been run?"
        : "No section in store cites a map sheet, so there are no editions to show."
    )
  }

  const lineOf = new Map(rows.map((r) => [r.section_id, r.line_id ?? null]))
  const lineIds = [...new Set(rows.flatMap((r) => r.line_id ?? []))]

  const sections = features.map((feature) => {
    const accepted = (key: string) =>
      newest(
        feature.claims.filter(
          (c) => c.attribute_key === key && c.status === "accepted"
        )
      )
    const route = accepted("route")[0]
    if (!route?.value_geom) {
      throw new StoreError(
        "unreadable",
        `Section ${feature.id} is drawn by store but has no accepted route.`
      )
    }

    const shown = route.citations.filter(
      (c) => c.role === "map_shows" && sheets.has(c.source_id)
    )
    const first = shown
      .map((c) => sheets.get(c.source_id)!)
      .sort((a, b) => a.year - b.year)[0]
    const endYear = yearOf(feature.dates?.time_end)
    // With no sheet behind its route the section is shown in every edition
    // and its First seen is Unknown.
    const editionIds = editions
      .filter(
        (e) =>
          (first === undefined || e.year >= first.year) &&
          (endYear === null || e.year <= endYear)
      )
      .map((e) => e.id)

    const claims: Claim[] = FACTS.map(({ attribute, key }) => {
      if (attribute === "First seen" && first) {
        return {
          attribute,
          value: `${first.year} edition`,
          citations: shown
            .filter((c) => sheets.get(c.source_id) === first)
            .map(toCitation),
          proposals: [],
        }
      }
      if (key === null) {
        return { attribute, value: null, citations: [], proposals: [] }
      }
      const facts = accepted(key).filter(
        (c) => valueOf(c) !== null && c.citations.length > 0
      )
      const proposals = feature.claims
        .filter((c) => c.attribute_key === key && c.status === "candidate")
        .flatMap((c) => {
          const value = valueOf(c)
          return value !== null && c.citations.length > 0
            ? [{ value, citation: toCitation(c.citations[0]) }]
            : []
        })
      const values = [...new Set(facts.map((c) => valueOf(c)!))]
      return {
        attribute,
        value: values.length > 0 ? values.join("; ") : null,
        citations:
          values.length > 0
            ? facts.flatMap((c) => c.citations.map(toCitation))
            : [],
        proposals,
      }
    })

    return {
      id: feature.id,
      code: shortId(feature.id),
      name: feature.label ? feature.label : null,
      pipelineId: lineOf.get(feature.id) ?? null,
      editionIds: editionIds.length > 0 ? editionIds : [editions[0].id],
      geometry: lineGeometry(route.value_geom, feature.id),
      claims,
      ...(feature.created_at
        ? { addedAt: feature.created_at.slice(0, 10) }
        : {}),
    }
  })

  const input: InputNetwork = {
    version: 1,
    name,
    // With no pipelines yet the list is grouped by edition.
    groupBy: lineIds.length > 0 ? "pipeline" : "edition",
    editions,
    pipelines: lineIds.map((id) => ({
      id,
      code: shortId(id),
      name: shortId(id),
    })),
    sections,
  }
  try {
    return parseNetwork(input)
  } catch (error) {
    throw new StoreError(
      "unreadable",
      error instanceof Error && "detail" in error
        ? String(error.detail)
        : String(error)
    )
  }
}
