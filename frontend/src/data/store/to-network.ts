import { shortId } from "../short-id"
import { shownBy, yearOf } from "../evidence"
import {
  citationRoles,
  parseNetwork,
  type ClaimValue,
  type Network,
  type Section,
} from "../schema"
import {
  StoreError,
  type StoreAccepted,
  type StoreCitation,
  type StoreClaim,
  type StoreFeature,
  type StoreLink,
  type StoreSectionRow,
} from "./client"

/*
 * Store's answers turned into the Network the screen draws. Pure: no fetch.
 *
 * Two layers. The summary (`toSummary`) comes from store's list of sections
 * and the links of the network, with no request per section: every section's
 * route, the value of each claim row and how many proposals wait on it. The
 * detail (`toDetail`) is one section's claims with their citations and
 * proposals, read when the section is opened. Both word a value through the
 * same functions below, so the list and the panel never disagree.
 *
 * What store says and what Studio shows:
 *  - A map sheet that shows a section is an edition; its year is the sheet's
 *    date.
 *  - The sheet a section's route is cited to is where it is first seen. The
 *    section is in that edition and every later one. That year is when a map
 *    first shows the line, not when it was built: Build date stays Unknown.
 *  - Only accepted claims with a citation are shown as values. A candidate
 *    claim is a proposal. No accepted claim means Unknown; nothing is filled
 *    in.
 *  - A section's claims are store's scope: its own, and those it has through
 *    a confirmed link (a line traced as gone that a person matched to it, the
 *    section it was split from). Two sections never become one: such a claim
 *    stays the other feature's, and its citations say where it comes from.
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
  url?: string
  archiveUrl?: string
  sourceId?: string
  sourceKind?: string
  inheritedFrom?: string
}

interface Claim {
  id?: string
  attribute: string
  value: string | null
  valid?: string
  madeAt?: string
  citations: Citation[]
  proposals: { id?: string; value: string; citation: Citation }[]
}

type Geometry = ReturnType<typeof lineGeometry>

interface ProposedEnd {
  id: string
  kind: "end" | "cut"
  otherSectionId: string
  score: number
  proposer?: string
  geometry?: Geometry
  citations: Citation[]
}

/** What a section shows once it is opened: its claims, and its proposed ends in full. */
export interface SectionDetail {
  claims: Claim[]
  proposedEnds: ProposedEnd[]
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

const ATTRIBUTE_KEYS = new Map(ATTRIBUTES.map((a) => [a.attribute, a.key]))

/** Store's attribute_key for a section attribute Studio shows; null when the
 * attribute is narrative or computed and has no claim of its own to write. */
export function attributeStoreKey(attribute: string): string | null {
  return ATTRIBUTE_KEYS.get(attribute) ?? null
}

const isRole = (role: string): role is Role =>
  (citationRoles as readonly string[]).includes(role)

/** A map reading: the sheet shows the line or leaves it out. */
const isMapReading = (c: StoreCitation) =>
  c.source_kind === "map_sheet" &&
  (c.role === "map_shows" || c.role === "map_omits")

const toCitation = (
  c: StoreCitation,
  inheritedFrom?: string | null
): Citation => ({
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
  ...(c.url ? { url: c.url } : {}),
  ...(c.archive_url ? { archiveUrl: c.archive_url } : {}),
  sourceId: c.source_id,
  sourceKind: c.source_kind,
  ...(inheritedFrom ? { inheritedFrom } : {}),
})

/** The year of a map sheet a citation names; null for anything else. */
const sheetYear = (c: StoreCitation): number | null =>
  c.source_kind === "map_sheet" ? yearOf(c.as_of_edtf) : null

/*
 * One accepted claim, as both layers have it: store's list gives it raw and
 * without citations; a feature's detail gives it with them. Worded here only.
 */
interface Stated {
  id?: string
  key: string
  text: string | null
  num: number | null
  unit: string | null
  /** A route claim with a line. Its value is the line, not words. */
  traced: boolean
  valid: string | null
  createdAt: string | null
  /** The earliest date of a map sheet cited as showing the line. */
  shownAsOf: string | null
}

/** Code-unit order, as store sorts these dates ("1929" before "1929-08"). */
const earliest = (dates: readonly string[]): string | null =>
  dates.length === 0 ? null : dates.reduce((a, b) => (b < a ? b : a))

const statedFromRow = (key: string, c: StoreAccepted): Stated => ({
  id: c.claim_id,
  key,
  text: c.value_text ?? null,
  num: c.value_num ?? null,
  unit: c.value_unit ?? null,
  traced: key === "route",
  valid: c.valid_edtf ?? null,
  createdAt: c.created_at ?? null,
  shownAsOf: c.shown_as_of ?? null,
})

const statedFromClaim = (c: StoreClaim): Stated => ({
  ...(c.id ? { id: c.id } : {}),
  key: c.attribute_key,
  text: c.value_text ?? null,
  num: c.value_num ?? null,
  unit: c.value_unit ?? null,
  traced: c.attribute_key === "route" && Boolean(c.value_geom),
  valid: c.valid_edtf ?? null,
  createdAt: c.created_at ?? null,
  shownAsOf: earliest(
    c.citations.flatMap((x) =>
      x.role === "map_shows" && x.source_kind === "map_sheet" && x.as_of_edtf
        ? [x.as_of_edtf]
        : []
    )
  ),
})

/** A claim's value as words; null when it has none Studio can show. */
function valueOf(c: Stated): string | null {
  if (c.key === "route") return c.traced ? "Traced line" : null
  if (c.num !== null) {
    return [String(c.num), c.unit].filter(Boolean).join(" ")
  }
  return c.text ? c.text : null
}

/**
 * A status as a map can support it. "operational" cited to a map that shows
 * the line says only that the line was drawn by that map's date.
 */
function statusWords(c: Stated): string | null {
  const text = valueOf(c)
  if (text !== "operational" || c.shownAsOf === null) return text
  return shownBy({ source: "", role: "map_shows", asOf: c.shownAsOf }) ?? text
}

const wordsFor = (key: string) => (key === "status" ? statusWords : valueOf)

/**
 * One claim row from the accepted claims behind it, newest first: their
 * values once each, joined. One claim behind the value: its id and period
 * can be shown. Several are joined into one row, which then speaks for none
 * of them alone.
 */
function rowOf(key: string, stated: readonly Stated[]) {
  const words = wordsFor(key)
  const shown = stated.filter((c) => words(c) !== null)
  const values = [...new Set(shown.map((c) => words(c)!))]
  return {
    value: values.length > 0 ? values.join("; ") : null,
    shown,
    only: shown.length === 1 ? shown[0] : undefined,
  }
}

const newest = <T extends { created_at?: string | null }>(claims: T[]) =>
  [...claims].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )

/** First seen, from the years of the sheets that show the route. */
const firstSeenWords = (years: readonly number[]) =>
  years.length > 0 ? `${Math.min(...years)} edition` : null

/** Last seen, once a person confirmed which map no longer shows the line. */
const lastSeenWords = (years: readonly number[], gone: number | null) =>
  years.length > 0 && gone !== null
    ? `${Math.max(...years)} edition, not on ${gone}`
    : null

/**
 * [x, y] pairs only: store may carry a third ordinate, the map does not.
 * `onePart`: a multi of one line is that line. Store's list sends every row
 * as a multi; the route it was made from is kept as it was traced.
 */
function lineGeometry(geom: unknown, featureId: string, onePart = false) {
  const g = geom as { type?: string; coordinates?: unknown } | null
  const flat = (line: unknown) =>
    (line as number[][]).map(([x, y]) => [x, y] as [number, number])
  try {
    if (g?.type === "LineString") {
      return { type: "LineString" as const, coordinates: flat(g.coordinates) }
    }
    if (g?.type === "MultiLineString") {
      const lines = (g.coordinates as unknown[]).map(flat)
      return onePart && lines.length === 1
        ? { type: "LineString" as const, coordinates: lines[0] }
        : { type: "MultiLineString" as const, coordinates: lines }
    }
  } catch {
    // Falls through to the error below.
  }
  throw new StoreError(
    "unreadable",
    `Section ${featureId}: its route is not a line Studio can draw.`
  )
}

const acceptedOf = (claims: readonly StoreClaim[], key: string) =>
  newest(
    claims.filter((c) => c.attribute_key === key && c.status === "accepted")
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

/** The name of whoever proposed a link, when that is a tool; never a person's. */
const toolName = (link: StoreLink): string | undefined =>
  link.asserted_by_name &&
  link.asserted_by_kind !== undefined &&
  link.asserted_by_kind !== null &&
  link.asserted_by_kind !== "person"
    ? link.asserted_by_name
    : undefined

/** A candidate claim with a value and a source, as a proposal. */
const proposalsOf = (claims: readonly StoreClaim[], key: string) =>
  claims
    .filter((c) => c.attribute_key === key && c.status === "candidate")
    .flatMap((c) => {
      const value = valueOf(statedFromClaim(c))
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

/** What store holds beside the sections' rows. */
export interface StoreExtras {
  /** same_as, overlaps and part_of links of the network, any status. */
  links?: readonly StoreLink[]
  /** The line features: the pipelines. */
  lines?: readonly StoreFeature[]
}

/**
 * The network from store's list: every section with its route, the value of
 * each claim row and the proposals waiting, and the pipelines. No section's
 * claims or citations: those are its detail (`toDetail`).
 */
export function toSummary(
  name: string,
  rows: readonly StoreSectionRow[],
  { links = [], lines = [] }: StoreExtras = {}
): Network {
  // One section per section id, whatever rows store draws it as: a proposed
  // cut makes pieces, each its own row.
  const bySection = new Map<string, StoreSectionRow[]>()
  for (const row of rows) {
    const held = bySection.get(row.section_id)
    if (held) held.push(row)
    else bySection.set(row.section_id, [row])
  }

  // Editions: one per year of the sheets that show a section.
  const years = [
    ...new Set([...bySection.values()].flatMap((r) => r[0].shown_years)),
  ].sort((a, b) => a - b)
  const editions = years.map((year) => ({
    id: `ed-${year}`,
    year,
    label: `${year} edition`,
  }))
  if (editions.length === 0) {
    throw new StoreError(
      "unreadable",
      bySection.size === 0
        ? "Store has no sections for this network. Has the import been run?"
        : "No section in store cites a map sheet, so there are no editions to show."
    )
  }

  const sectionIds = new Set(bySection.keys())
  const proposedEnds = new Map<string, ProposedEnd[]>()
  const proposedIn = new Map<
    string,
    { id: string; pipelineId: string; score: number; proposer?: string }[]
  >()
  const confirmedIn = new Map<string, string>()
  const membershipOf = new Map<string, string>()
  const score = (link: StoreLink) => Math.min(1, Math.max(0, link.score ?? 0))
  for (const link of links) {
    const fromSection = sectionIds.has(link.from_feature_id)
    // Only links between a section and something that is not one.
    if (fromSection === sectionIds.has(link.to_feature_id)) continue
    const [sectionId, otherId] = fromSection
      ? [link.from_feature_id, link.to_feature_id]
      : [link.to_feature_id, link.from_feature_id]
    const proposer = toolName(link)
    const kind = END_RELATIONS[link.relation]
    if (kind !== undefined && link.status === "proposed") {
      proposedEnds.set(sectionId, [
        ...(proposedEnds.get(sectionId) ?? []),
        {
          id: link.id,
          kind,
          otherSectionId: otherId,
          score: score(link),
          ...(proposer ? { proposer } : {}),
          citations: [],
        },
      ])
    }
    if (link.relation !== "part_of") continue
    if (link.status === "confirmed") {
      confirmedIn.set(sectionId, otherId)
      membershipOf.set(sectionId, link.id)
    }
    if (link.status !== "proposed") continue
    proposedIn.set(sectionId, [
      ...(proposedIn.get(sectionId) ?? []),
      {
        id: link.id,
        pipelineId: otherId,
        score: score(link),
        ...(proposer ? { proposer } : {}),
      },
    ])
  }

  const pipelineOf = (sectionId: string) =>
    bySection.get(sectionId)?.[0].line_id ?? confirmedIn.get(sectionId) ?? null
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const pipelineIds = [
    ...new Set([
      ...[...sectionIds].flatMap((id) => pipelineOf(id) ?? []),
      ...[...proposedIn.values()].flat().map((p) => p.pipelineId),
    ]),
  ]
  const pipelines = pipelineIds.map((id) => {
    const line = lineById.get(id)
    const claims: Claim[] = line
      ? PIPELINE_ATTRIBUTES.flatMap(({ attribute, key }) => {
          const stated = acceptedOf(line.claims, key).filter(
            (c) =>
              c.citations.length > 0 && valueOf(statedFromClaim(c)) !== null
          )
          const proposals = proposalsOf(line.claims, key)
          // One row per accepted claim: an owner that changed is two rows,
          // each with its period. Candidates wait on the first row.
          const own: Claim[] = stated.map((c, index) => ({
            ...(c.id ? { id: c.id } : {}),
            attribute,
            value: valueOf(statedFromClaim(c)),
            ...(c.valid_edtf ? { valid: c.valid_edtf } : {}),
            ...(c.created_at ? { madeAt: c.created_at.slice(0, 10) } : {}),
            citations: c.citations.map((x) => toCitation(x)),
            proposals: index === 0 ? proposals : [],
          }))
          return own.length > 0
            ? own
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

  const sections = [...bySection.entries()].map(([id, held]) => {
    const own = held.find((r) => r.row_id === id) ?? held[0]
    const route = own.whole_route ?? own.geometry
    if (!route) {
      throw new StoreError(
        "unreadable",
        `Section ${id} is drawn by store but has no route.`
      )
    }
    const endYear = own.end_status === "confirmed" ? yearOf(own.time_end) : null
    return {
      id,
      code: shortId(id),
      name: own.label ? own.label : null,
      pipelineId: pipelineOf(id),
      ...(membershipOf.has(id) ? { membershipId: membershipOf.get(id) } : {}),
      proposedMemberships: proposedIn.get(id) ?? [],
      editionIds: editionsOf(editions, own.shown_years, endYear),
      geometry: lineGeometry(route, id, own.whole_route == null),
      values: rowValues(own),
      proposedEnds: proposedEnds.get(id) ?? [],
      ...(own.created_at ? { addedAt: own.created_at.slice(0, 10) } : {}),
    }
  })

  return parsed({ version: 2, name, editions, pipelines, sections })
}

/**
 * The editions that show a section: from the first that shows it to the last
 * before a confirmed end. With no sheet behind its route the section is shown
 * in every edition and its First seen is Unknown.
 */
function editionsOf(
  editions: readonly { id: string; year: number }[],
  shown: readonly number[],
  endYear: number | null
): string[] {
  const first = shown.length > 0 ? Math.min(...shown) : null
  const ids = editions
    .filter(
      (e) =>
        (first === null || e.year >= first) &&
        (endYear === null || e.year <= endYear)
    )
    .map((e) => e.id)
  return ids.length > 0 ? ids : [editions[0].id]
}

/** The value of each claim row from store's list row. */
function rowValues(row: StoreSectionRow): ClaimValue[] {
  return ATTRIBUTES.map(({ attribute, key }) => {
    if (attribute === "First seen") {
      return { attribute, value: firstSeenWords(row.shown_years), proposals: 0 }
    }
    if (attribute === "Last seen") {
      return {
        attribute,
        value: lastSeenWords(row.shown_years, row.gone_year ?? null),
        proposals: 0,
      }
    }
    if (key === null) return { attribute, value: null, proposals: 0 }
    const stated = (row.accepted[key] ?? []).map((c) => statedFromRow(key, c))
    return {
      attribute,
      value: rowOf(key, stated).value,
      proposals: row.candidates[key] ?? 0,
    }
  })
}

/**
 * One section's detail from its feature: its claims with their citations and
 * proposals, and its proposed ends in full from the lines traced as gone
 * they point at. `section` is the section as the summary has it.
 */
export function toDetail(
  feature: StoreFeature,
  section: Pick<Section, "proposedEnds">,
  removals: readonly StoreFeature[] = []
): SectionDetail {
  // In scope: the section's own claims and those it has through confirmed
  // links, which stay the other feature's.
  const inScope = [
    ...feature.claims.map((claim) => ({ claim, from: null })),
    ...feature.inherited_claims.map((claim) => ({
      claim,
      from: claim.inherited_from ?? null,
    })),
  ]
  const fromOf = new Map(inScope.map((x) => [x.claim, x.from]))
  const cite = (claim: StoreClaim) =>
    claim.citations.map((x) => toCitation(x, fromOf.get(claim)))

  // The route is the section's own: the newest accepted one.
  const route = acceptedOf(feature.claims, "route")[0]
  const shown = (route?.citations ?? []).filter(
    (c) => c.role === "map_shows" && sheetYear(c) !== null
  )
  const shownYears = shown.map((c) => sheetYear(c)!)
  // A line traced as gone that a person matched to the section: the map
  // that leaves it out.
  const goneCitations = inScope
    .filter(
      ({ claim, from }) =>
        from !== null &&
        claim.attribute_key === "status" &&
        claim.status === "accepted" &&
        claim.value_text === "decommissioned"
    )
    .flatMap(({ claim }) =>
      claim.citations
        .filter((c) => c.role === "map_omits" && sheetYear(c) !== null)
        .map((c) => ({ c, from: fromOf.get(claim) }))
    )
  const goneYears = goneCitations.map(({ c }) => sheetYear(c)!)
  const goneYear = goneYears.length > 0 ? Math.min(...goneYears) : null

  const claims: Claim[] = ATTRIBUTES.map(({ attribute, key }) => {
    if (attribute === "First seen") {
      const value = firstSeenWords(shownYears)
      const first = Math.min(...shownYears)
      return {
        attribute,
        value,
        citations:
          value === null
            ? []
            : shown
                .filter((c) => sheetYear(c) === first)
                .map((c) => toCitation(c)),
        proposals: [],
      }
    }
    if (attribute === "Last seen") {
      const value = lastSeenWords(shownYears, goneYear)
      // The last map that shows it, and the next one, which does not.
      const last = shown.find((c) => sheetYear(c) === Math.max(...shownYears))
      return {
        attribute,
        value,
        citations:
          value === null || !last
            ? []
            : [
                toCitation(last),
                ...goneCitations.map(({ c, from }) => toCitation(c, from)),
              ],
        proposals: [],
      }
    }
    if (key === null) {
      return { attribute, value: null, citations: [], proposals: [] }
    }
    const stated = newest(
      inScope
        .map(({ claim }) => claim)
        .filter(
          (c) =>
            c.attribute_key === key &&
            c.status === "accepted" &&
            c.citations.length > 0
        )
    )
    const statedOf = new Map(stated.map((c) => [statedFromClaim(c), c]))
    const { value, shown: behind, only } = rowOf(key, [...statedOf.keys()])
    return {
      ...(only?.id ? { id: only.id } : {}),
      attribute,
      ...(only?.valid ? { valid: only.valid } : {}),
      ...(only?.createdAt ? { madeAt: only.createdAt.slice(0, 10) } : {}),
      value,
      citations:
        value === null ? [] : behind.flatMap((s) => cite(statedOf.get(s)!)),
      proposals: proposalsOf(feature.claims, key),
    }
  })

  const removalById = new Map(removals.map((f) => [f.id, f]))
  const proposedEnds = section.proposedEnds.map((end) => {
    const removal = removalById.get(end.otherSectionId)
    if (!removal) return end
    const gone = acceptedOf(removal.claims, "route")[0]
    const omits = acceptedOf(removal.claims, "status").flatMap((c) =>
      c.citations
        .filter((x) => x.role === "map_omits")
        .map((x) => toCitation(x))
    )
    return {
      ...end,
      ...(gone?.value_geom
        ? { geometry: lineGeometry(gone.value_geom, removal.id) }
        : {}),
      citations: [
        ...(gone?.citations ?? [])
          .filter((x) => x.role === "map_shows")
          .map((x) => toCitation(x)),
        ...omits,
      ],
    }
  })

  return { claims, proposedEnds }
}

/** The lines traced as gone that a section's proposed ends point at. */
export function removalIdsOf(
  sections: readonly Pick<Section, "proposedEnds">[]
) {
  return [
    ...new Set(
      sections.flatMap((s) => s.proposedEnds.map((e) => e.otherSectionId))
    ),
  ]
}

/**
 * The whole network with every section's detail in it, as the sample has it:
 * for tests, and for comparing the two layers.
 */
export function toNetwork(
  name: string,
  rows: readonly StoreSectionRow[],
  features: readonly StoreFeature[],
  {
    links = [],
    lines = [],
    removals = [],
  }: StoreExtras & {
    removals?: readonly StoreFeature[]
  } = {}
): Network {
  const summary = toSummary(name, rows, { links, lines })
  const featureById = new Map(features.map((f) => [f.id, f]))
  return parsed({
    ...summary,
    sections: summary.sections.map((section) => {
      const feature = featureById.get(section.id)
      if (!feature) return section
      const detail = toDetail(feature, section, removals)
      // The values stay the list's: a test compares them with the claims.
      return {
        ...section,
        claims: detail.claims,
        proposedEnds: detail.proposedEnds,
      }
    }),
  })
}

function parsed(input: InputNetwork): Network {
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
