import { shortId } from "../short-id"
import { shownBy, yearOf } from "../evidence"
import { citationRoles, parseNetwork, type Network } from "../schema"
import {
  StoreError,
  type StoreCitation,
  type StoreClaim,
  type StoreFeature,
  type StoreLink,
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
 *  - Only accepted claims are shown as values. A candidate claim is a proposal. No
 *    accepted claim means Unknown; nothing is filled in.
 *  - A citation keeps what it does for the claim (its role) and, for a map,
 *    the date the map is as of. For a map reading, store's locator is the
 *    trace file, not a place on the map, so it is kept apart as `file`.
 *  - A map only says a line was drawn. Store's "operational", cited to a map
 *    that shows the line, is worded "Shown by <the map's date>".
 *  - A line traced as gone (a removal) is never a section here: it is in no
 *    list and no count. A proposed same_as link to one is a proposed end of
 *    the section it runs along; a proposed overlaps link is a proposed cut.
 *    Neither changes the section: the geometry stays the route as traced, and
 *    Last seen stays Unknown until a person confirms the link in store. Then
 *    it is cited to both maps.
 *  - Who proposed a link is shown only when it is a tool. A person's name
 *    never leaves this file.
 *  - A line is a pipeline. A section confirmed part of a line is in that
 *    pipeline; a part_of link that is only proposed is a proposed
 *    membership and changes nothing. A pipeline's name, owner and operator
 *    are the line's own accepted claims, each with its period. A section
 *    carries no owner here: an owner claim store holds on a section is not
 *    shown.
 */

type InputNetwork = Parameters<typeof parseNetwork>[0]

type Role = (typeof citationRoles)[number]

interface Citation {
  id?: string
  source: string
  role?: Role
  asOf?: string
  locator?: string
  file?: string
  quote?: string
}

interface Claim {
  id?: string
  attribute: string
  value: string | null
  valid?: string
  citations: Citation[]
  proposals: { id?: string; value: string; citation: Citation }[]
}

interface ProposedEnd {
  id: string
  kind: "end" | "cut"
  otherSectionId: string
  score: number
  proposer?: string
  geometry: ReturnType<typeof lineGeometry>
  citations: Citation[]
}

/** The attributes Studio lists for a section, in order, and store's key for each. */
const ATTRIBUTES: { attribute: string; key: string | null }[] = [
  { attribute: "Diameter", key: "diameter" },
  { attribute: "Status", key: "status" },
  { attribute: "First seen", key: null },
  { attribute: "Last seen", key: null },
  { attribute: "Build date", key: null },
  { attribute: "Geometry", key: "route" },
]

const isRole = (role: string): role is Role =>
  (citationRoles as readonly string[]).includes(role)

/** A map reading: the sheet shows the line or leaves it out. */
const isMapReading = (c: StoreCitation) =>
  c.source_kind === "map_sheet" &&
  (c.role === "map_shows" || c.role === "map_omits")

const toCitation = (c: StoreCitation): Citation => ({
  ...(c.id ? { id: c.id } : {}),
  source: c.source_title,
  ...(isRole(c.role) ? { role: c.role } : {}),
  ...(c.source_kind === "map_sheet" && c.as_of_edtf
    ? { asOf: c.as_of_edtf }
    : {}),
  ...(c.locator
    ? isMapReading(c)
      ? { file: c.locator }
      : { locator: c.locator }
    : {}),
  ...(c.quote ? { quote: c.quote } : {}),
  ...(c.identifier ? { identifier: c.identifier } : {}),
  ...(typeof c.confidence === "number" && c.confidence >= 0 && c.confidence <= 1
    ? { confidence: c.confidence }
    : {}),
})

/** The day a claim was made, from store's timestamp. */
const madeAt = (c: StoreClaim | undefined) =>
  c?.created_at ? { madeAt: c.created_at.slice(0, 10) } : {}

/**
 * A status as a map can support it. "operational" cited to a map that shows
 * the line says only that the line was drawn by that map's date.
 */
function statusWords(claim: StoreClaim): string | null {
  const text = valueOf(claim)
  if (text !== "operational") return text
  const dated = claim.citations
    .filter((c) => c.role === "map_shows")
    .map(toCitation)
    .sort((a, b) => (a.asOf ?? "").localeCompare(b.asOf ?? ""))
    .flatMap((c) => shownBy(c) ?? [])
  return dated[0] ?? text
}

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

const acceptedOf = (feature: StoreFeature, key: string) =>
  newest(
    feature.claims.filter(
      (c) => c.attribute_key === key && c.status === "accepted"
    )
  )

/** The links that say a line traced as gone runs along a section. */
const END_RELATIONS: Record<string, "end" | "cut"> = {
  same_as: "end",
  overlaps: "cut",
}

/** What a pipeline carries, and store's key for each. */
const PIPELINE_ATTRIBUTES: { attribute: string; key: string }[] = [
  { attribute: "Name", key: "name" },
  { attribute: "Owner", key: "owner" },
  { attribute: "Operator", key: "operator" },
]

/** What store holds beside the sections themselves. */
export interface StoreExtras {
  /** same_as, overlaps and part_of links, any status. */
  links?: readonly StoreLink[]
  /** The lines traced as gone that same_as and overlaps links point at. */
  removals?: readonly StoreFeature[]
  /** The line features: the pipelines. */
  lines?: readonly StoreFeature[]
}

export function toNetwork(
  name: string,
  rows: readonly StoreSectionRow[],
  features: readonly StoreFeature[],
  { links = [], removals = [], lines = [] }: StoreExtras = {}
): Network {
  // Editions: one per year of the map sheets a claim cites. Two sheets of
  // the same year (two scans, or two maps) are one edition, not two rows
  // with the same name.
  const sheets = new Map<string, { id: string; year: number }>()
  for (const feature of features) {
    for (const claim of feature.claims) {
      for (const c of claim.citations) {
        const year = yearOf(c.as_of_edtf)
        if (c.source_kind !== "map_sheet" || year === null) continue
        sheets.set(c.source_id, { id: `ed-${year}`, year })
      }
    }
  }
  const editions = [
    ...new Map([...sheets.values()].map((e) => [e.id, e])).values(),
  ]
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

  // Who asserted what kind of thing. Store names the kind on claims only, so
  // an agent seen asserting a claim as a person is never named on a link.
  const people = new Set<string>()
  const linkNames = new Map<string, string>()
  for (const feature of [...features, ...removals, ...lines]) {
    for (const claim of feature.claims) {
      if (claim.asserted_by && claim.asserted_by_kind === "person") {
        people.add(claim.asserted_by)
      }
    }
    for (const link of feature.links) {
      if (link.asserted_by_name) linkNames.set(link.id, link.asserted_by_name)
    }
  }
  const toolName = (link: StoreLink): string | undefined => {
    const name = link.asserted_by_name ?? linkNames.get(link.id)
    if (!name || link.asserted_by_kind === "person") return undefined
    if (link.asserted_by && people.has(link.asserted_by)) return undefined
    return name
  }

  const sectionIds = new Set(features.map((f) => f.id))
  const removalById = new Map(removals.map((f) => [f.id, f]))
  const proposedEnds = new Map<string, ProposedEnd[]>()
  /** Per section: the maps that leave it out, once a person confirmed so. */
  const confirmedGone = new Map<string, Citation[]>()
  for (const link of links) {
    const kind = END_RELATIONS[link.relation]
    if (kind === undefined) continue
    const [sectionId, removalId] = sectionIds.has(link.to_feature_id)
      ? [link.to_feature_id, link.from_feature_id]
      : [link.from_feature_id, link.to_feature_id]
    const removal = removalById.get(removalId)
    if (!sectionIds.has(sectionId) || !removal) continue
    const omits = acceptedOf(removal, "status").flatMap((c) =>
      c.citations.filter((x) => x.role === "map_omits").map(toCitation)
    )
    if (link.status === "confirmed" && kind === "end") {
      confirmedGone.set(sectionId, [
        ...(confirmedGone.get(sectionId) ?? []),
        ...omits,
      ])
      continue
    }
    if (link.status !== "proposed") continue
    const route = acceptedOf(removal, "route")[0]
    if (!route?.value_geom) continue
    const proposer = toolName(link)
    const end: ProposedEnd = {
      id: link.id,
      kind,
      otherSectionId: removal.id,
      score: Math.min(1, Math.max(0, link.score ?? 0)),
      ...(proposer ? { proposer } : {}),
      geometry: lineGeometry(route.value_geom, removal.id),
      citations: [
        ...route.citations
          .filter((x) => x.role === "map_shows")
          .map(toCitation),
        ...omits,
      ],
    }
    proposedEnds.set(sectionId, [...(proposedEnds.get(sectionId) ?? []), end])
  }

  // Pipelines: every line a section is confirmed or proposed part of.
  const proposedIn = new Map<
    string,
    { id: string; pipelineId: string; score: number; proposer?: string }[]
  >()
  const confirmedIn = new Map<string, string>()
  for (const link of links) {
    if (link.relation !== "part_of") continue
    const [sectionId, lineId] = sectionIds.has(link.from_feature_id)
      ? [link.from_feature_id, link.to_feature_id]
      : [link.to_feature_id, link.from_feature_id]
    if (!sectionIds.has(sectionId) || sectionIds.has(lineId)) continue
    if (link.status === "confirmed") confirmedIn.set(sectionId, lineId)
    if (link.status !== "proposed") continue
    const proposer = toolName(link)
    proposedIn.set(sectionId, [
      ...(proposedIn.get(sectionId) ?? []),
      {
        id: link.id,
        pipelineId: lineId,
        score: Math.min(1, Math.max(0, link.score ?? 0)),
        ...(proposer ? { proposer } : {}),
      },
    ])
  }
  const pipelineOf = (sectionId: string) =>
    lineOf.get(sectionId) ?? confirmedIn.get(sectionId) ?? null
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const pipelineIds = [
    ...new Set([
      ...features.flatMap((f) => pipelineOf(f.id) ?? []),
      ...[...proposedIn.values()].flat().map((p) => p.pipelineId),
    ]),
  ]
  const pipelines = pipelineIds.map((id) => {
    const line = lineById.get(id)
    const claims: Claim[] = line
      ? PIPELINE_ATTRIBUTES.flatMap(({ attribute, key }) => {
          const stated = acceptedOf(line, key).filter(
            (c) => valueOf(c) !== null && c.citations.length > 0
          )
          const proposals = line.claims
            .filter((c) => c.attribute_key === key && c.status === "candidate")
            .flatMap((c) => {
              const value = valueOf(c)
              return value !== null && c.citations.length > 0
                ? [
                    {
                      ...(c.id ? { id: c.id } : {}),
                      value,
                      citation: toCitation(c.citations[0]),
                    },
                  ]
                : []
            })
          // One row per accepted claim: an owner that changed is two rows,
          // each with its period. Candidates wait on the first row.
          const rows: Claim[] = stated.map((c, index) => ({
            ...(c.id ? { id: c.id } : {}),
            attribute,
            value: valueOf(c),
            ...(c.valid_edtf ? { valid: c.valid_edtf } : {}),
            ...madeAt(c),
            citations: c.citations.map(toCitation),
            proposals: index === 0 ? proposals : [],
          }))
          return rows.length > 0
            ? rows
            : proposals.length > 0
              ? [{ attribute, value: null, citations: [], proposals }]
              : []
        })
      : []
    const named = claims.find((c) => c.attribute === "Name" && c.value)?.value
    return {
      id,
      code: shortId(id),
      name: named ?? (line?.label ? line.label : null),
      claims,
    }
  })

  const sections = features.map((feature) => {
    const accepted = (key: string) => acceptedOf(feature, key)
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

    const claims: Claim[] = ATTRIBUTES.map(({ attribute, key }) => {
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
      const gone = confirmedGone.get(feature.id)
      if (attribute === "Last seen" && gone && gone.length > 0) {
        // Confirmed by a person: the last map that shows it, and the next
        // one, which does not.
        const last = [...shown].sort(
          (a, b) =>
            sheets.get(b.source_id)!.year - sheets.get(a.source_id)!.year
        )[0]
        const goneYear = yearOf(gone[0].asOf)
        if (last && goneYear !== null) {
          return {
            attribute,
            value: `${sheets.get(last.source_id)!.year} edition, not on ${goneYear}`,
            citations: [toCitation(last), ...gone],
            proposals: [],
          }
        }
      }
      if (key === null) {
        return { attribute, value: null, citations: [], proposals: [] }
      }
      const words = key === "status" ? statusWords : valueOf
      const stated = accepted(key).filter(
        (c) => words(c) !== null && c.citations.length > 0
      )
      const proposals = feature.claims
        .filter((c) => c.attribute_key === key && c.status === "candidate")
        .flatMap((c) => {
          const value = valueOf(c)
          return value !== null && c.citations.length > 0
            ? [
                {
                  ...(c.id ? { id: c.id } : {}),
                  value,
                  citation: toCitation(c.citations[0]),
                },
              ]
            : []
        })
      const values = [...new Set(stated.map((c) => words(c)!))]
      // One claim behind the value: its id and period can be shown. Several
      // are joined into one row, which then speaks for none of them alone.
      const only = stated.length === 1 ? stated[0] : undefined
      return {
        ...(only?.id ? { id: only.id } : {}),
        attribute,
        ...(only?.valid_edtf ? { valid: only.valid_edtf } : {}),
        ...madeAt(only),
        value: values.length > 0 ? values.join("; ") : null,
        citations:
          values.length > 0
            ? stated.flatMap((c) => c.citations.map(toCitation))
            : [],
        proposals,
      }
    })

    return {
      id: feature.id,
      code: shortId(feature.id),
      name: feature.label ? feature.label : null,
      pipelineId: pipelineOf(feature.id),
      proposedMemberships: proposedIn.get(feature.id) ?? [],
      editionIds: editionIds.length > 0 ? editionIds : [editions[0].id],
      geometry: lineGeometry(route.value_geom, feature.id),
      claims,
      proposedEnds: proposedEnds.get(feature.id) ?? [],
      ...(feature.created_at
        ? { addedAt: feature.created_at.slice(0, 10) }
        : {}),
    }
  })

  const input: InputNetwork = {
    version: 2,
    name,
    editions,
    pipelines,
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
