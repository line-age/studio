import { formatValid } from "./evidence"
import type {
  Claim,
  Edition,
  Geometry,
  Network,
  Pipeline,
  Position,
  Section,
} from "./schema"
import {
  DEFAULT_REQUIRED,
  groupStatus,
  missingRequired,
  needsDecision,
  sectionStatus,
  statusCounts,
  unknownByAttribute,
  type SectionStatus,
  type StatusCounts,
  type StatusRule,
} from "./status"

/*
 * Everything the screen shows that is not stored: counts, status, what is in
 * view, what a search matches. Pure functions, so they are easy to test and
 * the same answers will hold when the data comes from an API.
 */

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number]

export const UNASSIGNED_ID = "unassigned"

export interface Stats {
  /** Claims in total. */
  total: number
  /** Claims with a value and at least one citation. */
  cited: number
  /** Claims whose value is Unknown. */
  unknown: number
  /** AI proposals waiting. */
  proposals: number
}

/** What a section goes by in words: its name, or its code when it has none. */
export function sectionLabel(section: Section): string {
  return section.name ?? section.code
}

/** What a pipeline goes by in words: its name, or its code when it has none. */
export function pipelineLabel(pipeline: Pipeline): string {
  return pipeline.name ?? pipeline.code
}

/**
 * How the one list is grouped: what its rows are. "sections" is every
 * section by the edition that first shows it (the name is from when this was
 * a list of its own); "pipelines" is every section by its pipeline. The
 * sections of a row are listed in the right panel.
 */
export const LIST_KINDS = ["sections", "pipelines"] as const
export type ListKind = (typeof LIST_KINDS)[number]

/** Each grouping in words: in the Group by select, as a column, as a title. */
export const GROUPING: Record<ListKind, { by: string; title: string }> = {
  sections: { by: "Edition", title: "Editions" },
  pipelines: { by: "Pipeline", title: "Pipelines" },
}

/** The row of sections in no pipeline and proposed for none. */
export const NO_PIPELINE_ID = "unassigned:none"

/** The grouping a network opens on: its pipelines, or editions if it has none. */
export function defaultList(network: Network): ListKind {
  return network.pipelines.length > 0 ? "pipelines" : "sections"
}

/**
 * The claims about a pipeline, in the order the screen lists them: name,
 * owner, operator. An attribute nobody has a claim for is one Unknown row; an
 * attribute that changed over the pipeline's life has one row per period.
 */
export const PIPELINE_ATTRIBUTES = ["Name", "Owner", "Operator"] as const

export function pipelineClaims(pipeline: Pipeline): Claim[] {
  return PIPELINE_ATTRIBUTES.flatMap((attribute) => {
    const claims = pipeline.claims.filter((c) => c.attribute === attribute)
    return claims.length > 0
      ? claims
      : [{ attribute, value: null, citations: [], proposals: [] }]
  })
}

/** A claim's value with the period it holds for: "Alder Gas Co., by 1931". */
export function datedValue(claim: Claim): string | null {
  if (claim.value === null) return null
  return claim.valid === undefined
    ? claim.value
    : `${claim.value}, ${formatValid(claim.valid)}`
}

/** For each section in a pipeline, the owners its pipeline is cited as having. */
export function ownersBySection(
  network: Network
): ReadonlyMap<string, readonly string[]> {
  const owners = new Map(
    network.pipelines.map((p) => [
      p.id,
      [
        ...new Set(
          p.claims.flatMap((c) =>
            c.attribute === COMPANY_ATTRIBUTE && c.value !== null
              ? [c.value]
              : []
          )
        ),
      ],
    ])
  )
  const out = new Map<string, readonly string[]>()
  for (const section of network.sections) {
    const found = section.pipelineId ? owners.get(section.pipelineId) : null
    if (found && found.length > 0) out.set(section.id, found)
  }
  return out
}

/**
 * One row of the list. Grouped by pipeline: a pipeline with the sections
 * confirmed part of it, a proposed pipeline (no section is confirmed yet)
 * with the sections proposed for it, or the one group of sections in no
 * pipeline. Grouped by edition: the sections first seen in one edition, in a
 * pipeline or not.
 */
export interface PipelineSummary {
  id: string
  /** null for a group of sections by first seen. */
  code: string | null
  name: string
  /** What the row goes by in the list: shorter than `name` for an edition. */
  label: string
  kind: "pipeline" | "proposed" | "first-seen" | "group"
  /** The pipeline behind the row; null for a group by first seen. */
  pipeline: Pipeline | null
  /** For a proposed pipeline: the lowest and highest score of its sections. */
  scores: [number, number] | null
  /** The row is a group of sections (an edition, no pipeline), not a pipeline. */
  unassigned: boolean
  /** For sections in no pipeline: the edition that first shows them. */
  firstSeen: Edition | null
  sections: Section[]
  stats: Stats
  /** One word for the group; "done" only when every section is done. */
  status: SectionStatus
  /** How many sections have each status. */
  statusCounts: StatusCounts
  /** How many sections are done. */
  done: number
  /** A proposal is waiting on one of the sections. */
  needsDecision: boolean
  /** For each required attribute, how many sections have it Unknown. */
  unknownByAttribute: Record<string, number>
  changed: boolean
  bounds: Bounds | null
}

/** The selected sections of one pipeline. */
export interface SelectionGroup {
  summary: PipelineSummary
  /** The selected ones, in the pipeline's order. */
  sections: Section[]
  /** Every section of the pipeline is selected. */
  whole: boolean
}

/** A selection of sections, sorted into the pipelines they belong to. */
export function groupSelection(
  summaries: PipelineSummary[],
  selection: ReadonlySet<string>
): SelectionGroup[] {
  if (selection.size === 0) return []
  const groups: SelectionGroup[] = []
  for (const summary of summaries) {
    const sections = summary.sections.filter((s) => selection.has(s.id))
    if (sections.length > 0) {
      groups.push({
        summary,
        sections,
        whole: sections.length === summary.sections.length,
      })
    }
  }
  return groups
}

/** "14 sections in 3 pipelines": the size of a selection in words. */
export function selectionSize(groups: SelectionGroup[]): string {
  const sections = groups.reduce((n, g) => n + g.sections.length, 0)
  const pipelines = groups.filter((g) => !g.summary.unassigned).length
  const words = plural(sections, "section")
  if (pipelines === 0) return words
  if (pipelines < groups.length) return `${words}, some in no pipeline`
  return `${words} in ${plural(pipelines, "pipeline")}`
}

/*
 * Progress, said one way everywhere, always with what it counts. A pipeline
 * counts its sections done; a section counts its required claims cited, the
 * same claims its status is worked out from (the rule in Settings). Sections
 * in no pipeline cannot be done, so a group of them says how many it has: a
 * bare number in a row, under the "Not in a pipeline" heading that says what
 * it counts (edition names leave no room for a noun), "312 sections" in full.
 */

/** "4/6 done" (short, for a row) or "4 of 6 sections done" (long). */
export function doneLabel(
  done: number,
  total: number,
  form: "short" | "long" = "short"
): string {
  return form === "short"
    ? `${formatCount(done)}/${formatCount(total)} done`
    : `${formatCount(done)} of ${plural(total, "section")} done`
}

/**
 * "2/3 cited": the required claims of a section that are cited. Empty when
 * the rule requires nothing, where there is nothing to count.
 */
export function citedLabel(section: Section, rule: StatusRule): string {
  if (rule.length === 0) return ""
  const cited = rule.length - missingRequired(section, rule).length
  return `${formatCount(cited)}/${formatCount(rule.length)} cited`
}

/** The progress of a row of the list: a pipeline, or a group in none. */
export function summaryProgress(
  summary: PipelineSummary,
  form: "short" | "long" = "short"
): string {
  // A proposed pipeline: the best score of its sections in a row, all of
  // them in full.
  if (summary.kind === "proposed" && summary.scores) {
    const [low, high] = summary.scores
    // A row has the "Proposed" badge beside it: the bare number is enough.
    if (form === "short") return high.toFixed(2)
    return low === high
      ? `Score ${high.toFixed(2)}`
      : `Scores ${low.toFixed(2)} to ${high.toFixed(2)}`
  }
  if (!summary.unassigned) {
    return doneLabel(summary.done, summary.sections.length, form)
  }
  return form === "short"
    ? formatCount(summary.sections.length)
    : plural(summary.sections.length, "section")
}

/** "3 pipelines", or "3 groups" when some of them are not pipelines. */
export function groupsLabel(groups: { unassigned: boolean }[]): string {
  return groups.some((g) => g.unassigned)
    ? plural(groups.length, "group")
    : plural(groups.length, "pipeline")
}

export function sectionStats(section: Section): Stats {
  let cited = 0
  let proposals = 0
  for (const claim of section.claims) {
    if (claim.value !== null) cited += 1
    proposals += claim.proposals.length
  }
  proposals += section.proposedEnds.length
  const total = section.claims.length
  return { total, cited, unknown: total - cited, proposals }
}

export function sumStats(sections: Section[]): Stats {
  const sum: Stats = { total: 0, cited: 0, unknown: 0, proposals: 0 }
  for (const section of sections) {
    const s = sectionStats(section)
    sum.total += s.total
    sum.cited += s.cited
    sum.unknown += s.unknown
    sum.proposals += s.proposals
  }
  return sum
}

function lines(geometry: Geometry): Position[][] {
  return geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.coordinates
}

export function geometryBounds(geometry: Geometry): Bounds {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const line of lines(geometry)) {
    for (const [lon, lat] of line) {
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  return [west, south, east, north]
}

export function unionBounds(all: Bounds[]): Bounds | null {
  if (all.length === 0) return null
  const out: Bounds = [...all[0]]
  for (const b of all) {
    if (b[0] < out[0]) out[0] = b[0]
    if (b[1] < out[1]) out[1] = b[1]
    if (b[2] > out[2]) out[2] = b[2]
    if (b[3] > out[3]) out[3] = b[3]
  }
  return out
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/** The earliest edition that shows the section: where it is first seen. */
export function firstEdition(
  network: Network,
  section: Section
): Edition | null {
  let first: Edition | null = null
  for (const edition of network.editions) {
    if (!section.editionIds.includes(edition.id)) continue
    if (first === null || edition.year < first.year) first = edition
  }
  return first
}

/**
 * A group with only some of its sections: what the filters, or the map view,
 * leave of it. Everything counted from the sections is counted again. Only
 * for a group; a pipeline is a thing of its own and stays whole.
 */
export function withSections(
  summary: PipelineSummary,
  sections: Section[],
  rule: StatusRule
): PipelineSummary {
  const counts = statusCounts(sections, rule)
  return {
    ...summary,
    sections,
    stats: sumStats(sections),
    status: groupStatus(counts),
    statusCounts: counts,
    done: counts.done,
    needsDecision: sections.some(needsDecision),
    unknownByAttribute: unknownByAttribute(sections, rule),
    changed: sections.some((s) => s.changedSinceReview),
    bounds: unionBounds(sections.map((s) => geometryBounds(s.geometry))),
  }
}

/**
 * The rows the filters leave. A pipeline stays whole when one of its
 * sections passes. A group (an edition, no pipeline) keeps only the sections
 * that pass, and with a `view` only those in it: a group spans the map, so
 * its row is what one can see and select of it.
 */
export function narrowRows(
  summaries: PipelineSummary[],
  criteria: SectionCriteria,
  view: Bounds | null = null
): PipelineSummary[] {
  const filtering = hasCriteria(criteria)
  return summaries.flatMap((summary) => {
    if (!summary.unassigned) {
      return matchesCriteria(summary, criteria) && inView(summary, view)
        ? [summary]
        : []
    }
    if (!filtering && view === null) return [summary]
    const sections = summary.sections.filter(
      (section) =>
        (!filtering || sectionMatches(section, criteria)) &&
        (view === null || intersects(geometryBounds(section.geometry), view))
    )
    if (sections.length === 0) return []
    return sections.length === summary.sections.length
      ? [summary]
      : [withSections(summary, sections, criteria.rule)]
  })
}

/** The id of the group of sections in no pipeline, first seen in an edition. */
export function firstSeenGroupId(editionId: string): string {
  return `${UNASSIGNED_ID}:${editionId}`
}

/**
 * The rows of the list for one grouping. Each holds every section of the
 * network; there is no edition in force.
 *
 * Pipelines: one row per pipeline that has a confirmed section, in file
 * order, then the proposed pipelines: those with no confirmed section at
 * all, each with the sections proposed for it. Last, one row for the sections
 * in no pipeline and proposed for none.
 *
 * Sections: one group per edition, with the sections it is the first to
 * show, oldest first.
 */
export function summarise(
  network: Network,
  rule: StatusRule = DEFAULT_REQUIRED,
  list: ListKind = "pipelines"
): PipelineSummary[] {
  const build = (
    id: string,
    code: string | null,
    name: string,
    sections: Section[],
    firstSeen: Edition | null = null,
    pipeline: Pipeline | null = null,
    scores: [number, number] | null = null,
    group = false
  ): PipelineSummary => {
    const counts = statusCounts(sections, rule)
    return {
      id,
      code,
      name,
      label: firstSeen ? firstSeen.label : name,
      kind: firstSeen
        ? "first-seen"
        : group
          ? "group"
          : scores
            ? "proposed"
            : "pipeline",
      pipeline,
      scores,
      unassigned: firstSeen !== null || group,
      firstSeen,
      sections,
      stats: sumStats(sections),
      status: groupStatus(counts),
      statusCounts: counts,
      done: counts.done,
      needsDecision: sections.some(needsDecision),
      unknownByAttribute: unknownByAttribute(sections, rule),
      changed: sections.some((s) => s.changedSinceReview),
      bounds: unionBounds(sections.map((s) => geometryBounds(s.geometry))),
    }
  }

  const byPipeline = new Map<string, Section[]>()
  const byEdition = new Map<string, Section[]>()
  const push = (map: Map<string, Section[]>, key: string, s: Section) => {
    const list = map.get(key)
    if (list) list.push(s)
    else map.set(key, [s])
  }
  const byProposal = new Map<string, Section[]>()
  const scoresOf = new Map<string, number[]>()
  for (const section of network.sections) {
    if (section.pipelineId !== null) {
      push(byPipeline, section.pipelineId, section)
    }
    for (const proposed of section.proposedMemberships) {
      push(byProposal, proposed.pipelineId, section)
      scoresOf.set(proposed.pipelineId, [
        ...(scoresOf.get(proposed.pipelineId) ?? []),
        proposed.score,
      ])
    }
    const first = firstEdition(network, section)
    if (first) push(byEdition, first.id, section)
  }

  const out: PipelineSummary[] = []
  if (list === "sections") {
    for (const edition of [...network.editions].sort(
      (a, b) => a.year - b.year
    )) {
      const sections = byEdition.get(edition.id)
      if (sections) {
        out.push(
          build(
            firstSeenGroupId(edition.id),
            null,
            `First seen in the ${edition.label}`,
            sections,
            edition
          )
        )
      }
    }
    return out
  }
  // A pipeline is proposed while no section anywhere is confirmed part of it.
  const confirmed = new Set(network.sections.flatMap((s) => s.pipelineId ?? []))
  for (const pipeline of network.pipelines) {
    const sections = byPipeline.get(pipeline.id)
    if (sections) {
      out.push(
        build(
          pipeline.id,
          pipeline.code,
          pipelineLabel(pipeline),
          sections,
          null,
          pipeline
        )
      )
    }
  }
  for (const pipeline of network.pipelines) {
    const sections = byProposal.get(pipeline.id)
    const scores = scoresOf.get(pipeline.id)
    if (confirmed.has(pipeline.id) || !sections || !scores) continue
    out.push(
      build(
        pipeline.id,
        pipeline.code,
        pipelineLabel(pipeline),
        sections,
        null,
        pipeline,
        [Math.min(...scores), Math.max(...scores)]
      )
    )
  }
  // The rest, so this grouping holds every section too: in no pipeline and
  // proposed for none.
  const none = network.sections.filter(
    (section) =>
      section.pipelineId === null && section.proposedMemberships.length === 0
  )
  if (none.length > 0) {
    out.push(
      build(NO_PIPELINE_ID, null, "No pipeline", none, null, null, null, true)
    )
  }
  return out
}

/** The attribute that holds the company, and the one that holds the build year. */
export const COMPANY_ATTRIBUTE = "Owner"
export const BUILD_DATE_ATTRIBUTE = "Build date"
export const DIAMETER_ATTRIBUTE = "Diameter"

/**
 * Where a section stands with pipelines: confirmed part of one, proposed for
 * one and in none yet, or in none with nothing proposed.
 */
export const MEMBERSHIPS = ["in", "proposed", "none"] as const
export type Membership = (typeof MEMBERSHIPS)[number]
export const MEMBERSHIP_LABEL: Record<Membership, string> = {
  in: "In a pipeline",
  proposed: "Proposed for one",
  none: "In none",
}

export function membershipOf(section: Section): Membership {
  if (section.pipelineId !== null) return "in"
  return section.proposedMemberships.length > 0 ? "proposed" : "none"
}

/** What a section has to satisfy to pass the filters. Empty parts ask nothing. */
export interface SectionCriteria {
  /** One of these attributes is Unknown on the section. */
  unknownIn: readonly string[]
  /** The section's company is one of these. */
  companies: readonly string[]
  /** The section's build year is in this range, ends included. */
  builtFrom: number | null
  builtTo: number | null
  /** The section's record was added in this range of ISO days, ends included. */
  addedFrom: string | null
  addedTo: string | null
  /** The section has this status. */
  status: SectionStatus | "all"
  /** A proposal is waiting on the section. */
  needsDecision: boolean
  /** The section stands this way with pipelines. */
  memberships: readonly Membership[]
  /** The year of the edition that first shows the section is in this range. */
  firstSeenFrom: number | null
  firstSeenTo: number | null
  /** The section changed since a person last reviewed it. */
  changedOnly: boolean
  /** The section's cited diameter is one of these. */
  diameters: readonly string[]
  /** The section runs through one of these states. */
  states: readonly string[]
  /** The status rule: the attributes that must be cited. */
  rule: StatusRule
  /**
   * The owners of each section's pipeline (`ownersBySection`). Owner is a
   * claim on the pipeline; without this no section has a company.
   */
  owners?: ReadonlyMap<string, readonly string[]>
  /** The year of each edition, by id, for First seen. */
  editionYears?: ReadonlyMap<string, number>
  /** The states each section runs through (`statesBySection`). */
  statesOf?: { get(sectionId: string): readonly string[] | undefined }
}

export const NO_CRITERIA: SectionCriteria = {
  unknownIn: [],
  companies: [],
  builtFrom: null,
  builtTo: null,
  addedFrom: null,
  addedTo: null,
  status: "all",
  needsDecision: false,
  memberships: [],
  firstSeenFrom: null,
  firstSeenTo: null,
  changedOnly: false,
  diameters: [],
  states: [],
  rule: DEFAULT_REQUIRED,
}

const valueOf = (section: Section, attribute: string) =>
  section.claims.find((claim) => claim.attribute === attribute)?.value ?? null

/**
 * The companies a section is cited as owned by: its pipeline's owners over
 * its life, and its own Owner claim where a source gives one. None when both
 * are Unknown.
 */
export function companiesOf(
  section: Section,
  owners: SectionCriteria["owners"]
): readonly string[] {
  const own = valueOf(section, COMPANY_ATTRIBUTE)
  const ofPipeline = owners?.get(section.id) ?? []
  return own === null || ofPipeline.includes(own)
    ? ofPipeline
    : [...ofPipeline, own]
}

/** The year of the first edition that shows the section; null when none is known. */
export function firstSeenYear(
  section: Section,
  editionYears: SectionCriteria["editionYears"]
): number | null {
  const years = section.editionIds.flatMap((id) => editionYears?.get(id) ?? [])
  return years.length > 0 ? Math.min(...years) : null
}

/** The first four-digit year in the section's build date; null when Unknown. */
export function buildYear(section: Section): number | null {
  const year = valueOf(section, BUILD_DATE_ATTRIBUTE)?.match(/\d{4}/)?.[0]
  return year ? Number(year) : null
}

export function hasCriteria(criteria: SectionCriteria): boolean {
  return (
    criteria.unknownIn.length > 0 ||
    criteria.companies.length > 0 ||
    criteria.builtFrom !== null ||
    criteria.builtTo !== null ||
    criteria.addedFrom !== null ||
    criteria.addedTo !== null ||
    criteria.status !== "all" ||
    criteria.needsDecision ||
    criteria.memberships.length > 0 ||
    criteria.firstSeenFrom !== null ||
    criteria.firstSeenTo !== null ||
    criteria.changedOnly ||
    criteria.diameters.length > 0 ||
    criteria.states.length > 0
  )
}

/** One section against every part of the criteria at once. */
export function sectionMatches(
  section: Section,
  criteria: SectionCriteria
): boolean {
  const { unknownIn, companies, builtFrom, builtTo, addedFrom, addedTo } =
    criteria
  if (
    criteria.status !== "all" &&
    sectionStatus(section, criteria.rule) !== criteria.status
  ) {
    return false
  }
  if (criteria.needsDecision && !needsDecision(section)) return false
  if (
    unknownIn.length > 0 &&
    !section.claims.some(
      (claim) => claim.value === null && unknownIn.includes(claim.attribute)
    )
  ) {
    return false
  }
  if (companies.length > 0) {
    const owned = companiesOf(section, criteria.owners)
    if (!owned.some((company) => companies.includes(company))) return false
  }
  if (builtFrom !== null || builtTo !== null) {
    // An Unknown build date is not in any range.
    const year = buildYear(section)
    if (year === null) return false
    if (builtFrom !== null && year < builtFrom) return false
    if (builtTo !== null && year > builtTo) return false
  }
  if (addedFrom !== null || addedTo !== null) {
    // ISO days sort as text. A record with no added day is in no range.
    const added = section.addedAt
    if (!added) return false
    if (addedFrom !== null && added < addedFrom) return false
    if (addedTo !== null && added > addedTo) return false
  }
  if (
    criteria.memberships.length > 0 &&
    !criteria.memberships.includes(membershipOf(section))
  ) {
    return false
  }
  if (criteria.firstSeenFrom !== null || criteria.firstSeenTo !== null) {
    const year = firstSeenYear(section, criteria.editionYears)
    if (year === null) return false
    if (criteria.firstSeenFrom !== null && year < criteria.firstSeenFrom)
      return false
    if (criteria.firstSeenTo !== null && year > criteria.firstSeenTo)
      return false
  }
  if (criteria.changedOnly && !section.changedSinceReview) return false
  if (criteria.diameters.length > 0) {
    // An Unknown diameter is none of these.
    const diameter = valueOf(section, DIAMETER_ATTRIBUTE)
    if (diameter === null || !criteria.diameters.includes(diameter))
      return false
  }
  if (criteria.states.length > 0) {
    const through = criteria.statesOf?.get(section.id) ?? []
    if (!through.some((state) => criteria.states.includes(state))) return false
  }
  return true
}

/**
 * How many sections of the edition have each value, from `valuesOf`, with
 * every filter in force but `without`: what choosing a value would show.
 * Values in the order given by `order`, or by name.
 */
export function optionCounts<K extends keyof SectionCriteria>(
  summaries: PipelineSummary[],
  criteria: SectionCriteria,
  without: K,
  valuesOf: (section: Section) => readonly string[]
): { name: string; count: number }[] {
  const others = { ...criteria, [without]: NO_CRITERIA[without] }
  const counts = new Map<string, number>()
  for (const summary of summaries) {
    for (const section of summary.sections) {
      for (const name of valuesOf(section)) {
        if (!counts.has(name)) counts.set(name, 0)
      }
      if (!sectionMatches(section, others)) continue
      for (const name of new Set(valuesOf(section))) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

/** The cited diameter of a section, as its only value; none when Unknown. */
export function diameterOf(section: Section): readonly string[] {
  const value = valueOf(section, DIAMETER_ATTRIBUTE)
  return value === null ? [] : [value]
}

/** A pipeline passes when one of its sections satisfies all the criteria. */
export function matchesCriteria(
  summary: PipelineSummary,
  criteria: SectionCriteria
): boolean {
  if (!hasCriteria(criteria)) return true
  return summary.sections.some((section) => sectionMatches(section, criteria))
}

/**
 * True when the pipeline has a section whose value for one of these
 * attributes is Unknown. No attributes means no narrowing.
 */
export function matchesUnknownIn(
  summary: PipelineSummary,
  attributes: readonly string[]
): boolean {
  return matchesCriteria(summary, { ...NO_CRITERIA, unknownIn: attributes })
}

/**
 * For each attribute, how many sections have it Unknown. Sections, as every
 * number on the screen is, not the rows that hold them.
 */
export function unknownCounts(
  summaries: PipelineSummary[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const name of attributeNames(summaries)) counts.set(name, 0)
  for (const summary of summaries) {
    for (const section of summary.sections) {
      const unknown = new Set(
        section.claims.flatMap((c) => (c.value === null ? c.attribute : []))
      )
      for (const name of unknown) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Each company of the edition with how many sections are in a pipeline cited
 * as its own.
 */
export function companyCounts(
  summaries: PipelineSummary[],
  owners: SectionCriteria["owners"]
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const summary of summaries) {
    for (const section of summary.sections) {
      for (const name of companiesOf(section, owners)) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The first and last day a record of the edition was added; null when none says. */
export function addedSpan(
  summaries: PipelineSummary[]
): [string, string] | null {
  const days = summaries
    .flatMap((summary) =>
      summary.sections.flatMap((section) => section.addedAt ?? [])
    )
    .sort()
  return days.length > 0 ? [days[0], days[days.length - 1]] : null
}

/** The earliest and latest build year in the edition; null when none is cited. */
export function buildYearSpan(
  summaries: PipelineSummary[]
): [number, number] | null {
  const years = summaries.flatMap((summary) =>
    summary.sections.flatMap((section) => buildYear(section) ?? [])
  )
  return years.length > 0 ? [Math.min(...years), Math.max(...years)] : null
}

/** Every attribute of the edition, in the order sections list them. */
export function attributeNames(summaries: PipelineSummary[]): string[] {
  const names = new Set<string>()
  for (const summary of summaries) {
    for (const section of summary.sections) {
      for (const claim of section.claims) names.add(claim.attribute)
    }
  }
  return [...names]
}

/** What the row of counts above the list shows, all in sections. */
export interface FilterCounts {
  all: number
  status: StatusCounts
  needsDecision: number
}

/**
 * How many sections each one-click filter would leave, given the other
 * filters in force. The status counts ignore the status chosen, so each
 * says what choosing it would show; they follow "Needs your decision" when
 * it is on. That count in turn follows the status chosen.
 */
export function filterCounts(
  summaries: PipelineSummary[],
  criteria: SectionCriteria,
  view: Bounds | null = null
): FilterCounts {
  const others = { ...criteria, status: "all" as const, needsDecision: false }
  const status: StatusCounts = {
    "not-started": 0,
    "in-progress": 0,
    sufficient: 0,
    done: 0,
  }
  let all = 0
  let waiting = 0
  for (const summary of summaries) {
    if (!inView(summary, view)) continue
    for (const section of summary.sections) {
      // A pipeline in view counts whole; a group by first seen spans the
      // map, so only its sections in view count.
      if (
        summary.unassigned &&
        view !== null &&
        !intersects(geometryBounds(section.geometry), view)
      ) {
        continue
      }
      if (!sectionMatches(section, others)) continue
      const own = sectionStatus(section, criteria.rule)
      const decide = needsDecision(section)
      if (!criteria.needsDecision || decide) {
        all += 1
        status[own] += 1
      }
      if (decide && (criteria.status === "all" || criteria.status === own)) {
        waiting += 1
      }
    }
  }
  return { all, status, needsDecision: waiting }
}

export function inView(summary: PipelineSummary, view: Bounds | null): boolean {
  if (view === null || summary.bounds === null) return true
  if (!intersects(summary.bounds, view)) return false
  return summary.sections.some((s) =>
    intersects(geometryBounds(s.geometry), view)
  )
}

export function visiblePipelines(
  summaries: PipelineSummary[],
  filters: { view: Bounds | null } & Partial<SectionCriteria>
): PipelineSummary[] {
  const criteria = { ...NO_CRITERIA, ...filters }
  return summaries.filter(
    (s) => matchesCriteria(s, criteria) && inView(s, filters.view)
  )
}

export type SearchMatch =
  | { kind: "pipeline"; sections: number }
  | { kind: "section"; sectionId: string; name: string; code: string | null }
  | { kind: "sections"; count: number }
  | { kind: "claim"; attribute: string; value: string; sections: number }
  | { kind: "unknown"; attributes: string[]; sections: number }

/** One section a search found, and why when it was not its own name. */
export interface SectionMatch {
  sectionId: string
  /** The section's name, or its code when it has none. */
  name: string
  /** The code beside the name; null when the name is the code. */
  code: string | null
  /** "Owner: Alder Gas Co." or "Owner: Unknown"; null for a name or code match. */
  reason: string | null
}

export interface SearchHit {
  summary: PipelineSummary
  matches: SearchMatch[]
  /** Every section that matched, in the pipeline's order. */
  sections: SectionMatch[]
  /** The first matching section, so opening the hit can go straight to it. */
  firstSectionId: string | null
}

const fold = (text: string) => text.toLocaleLowerCase()

const named = (section: Section, needle: string) =>
  fold(section.name ?? "").includes(needle) ||
  fold(section.code).includes(needle)

/** A section's name and code as a search result shows them. */
const titleOf = (section: Section) => ({
  name: sectionLabel(section),
  code: section.name === null ? null : section.code,
})

/**
 * Search the given pipelines: by pipeline name or code, section name or code,
 * and cited value. A query with the word "unknown" finds sections with an
 * Unknown claim instead; more words narrow it to an attribute ("unknown owner").
 */
export function search(
  summaries: PipelineSummary[],
  query: string
): SearchHit[] {
  const needle = fold(query.trim())
  if (needle.length === 0) return []
  const hits: SearchHit[] = []

  const words = needle.split(/\s+/)
  if (words.includes("unknown")) {
    const rest = words.filter((word) => word !== "unknown").join(" ")
    for (const summary of summaries) {
      const sections: SectionMatch[] = []
      const attributes = new Set<string>()
      for (const section of summary.sections) {
        const unknown = section.claims
          .filter(
            (claim) =>
              claim.value === null &&
              (rest === "" || fold(claim.attribute).includes(rest))
          )
          .map((claim) => claim.attribute)
        if (unknown.length === 0) continue
        unknown.forEach((attribute) => attributes.add(attribute))
        sections.push({
          sectionId: section.id,
          ...titleOf(section),
          reason: `${unknown.join(", ")}: Unknown`,
        })
      }
      if (sections.length > 0) {
        hits.push({
          summary,
          matches: [
            {
              kind: "unknown",
              attributes: [...attributes],
              sections: sections.length,
            },
          ],
          sections,
          firstSectionId: sections[0].sectionId,
        })
      }
    }
    return hits
  }

  for (const summary of summaries) {
    const matches: SearchMatch[] = []
    if (
      !summary.unassigned &&
      (fold(summary.name).includes(needle) ||
        fold(summary.code ?? "").includes(needle) ||
        // What is claimed about the pipeline: its owner, its operator.
        (summary.pipeline?.claims ?? []).some(
          (claim) => claim.value !== null && fold(claim.value).includes(needle)
        ))
    ) {
      matches.push({ kind: "pipeline", sections: summary.sections.length })
    }

    const matched = summary.sections.filter((s) => named(s, needle))
    if (matched.length === 1) {
      const [s] = matched
      matches.push({ kind: "section", sectionId: s.id, ...titleOf(s) })
    } else if (matched.length > 1) {
      matches.push({ kind: "sections", count: matched.length })
    }

    const claims = new Map<string, Extract<SearchMatch, { kind: "claim" }>>()
    let firstClaimSection: string | null = null
    for (const section of summary.sections) {
      for (const claim of section.claims) {
        if (claim.value === null || !fold(claim.value).includes(needle)) {
          continue
        }
        firstClaimSection ??= section.id
        const key = `${claim.attribute}\u0000${claim.value}`
        const found = claims.get(key)
        if (found) found.sections += 1
        else {
          claims.set(key, {
            kind: "claim",
            attribute: claim.attribute,
            value: claim.value,
            sections: 1,
          })
        }
      }
    }
    matches.push(...claims.values())

    const sections: SectionMatch[] = []
    for (const section of summary.sections) {
      const byName = named(section, needle)
      const claim = section.claims.find(
        (c) => c.value !== null && fold(c.value).includes(needle)
      )
      if (!byName && !claim) continue
      sections.push({
        sectionId: section.id,
        ...titleOf(section),
        reason: byName || !claim ? null : `${claim.attribute}: ${claim.value}`,
      })
    }

    if (matches.length > 0) {
      hits.push({
        summary,
        matches: matches.slice(0, 3),
        sections,
        firstSectionId: matched[0]?.id ?? firstClaimSection,
      })
    }
  }
  return hits
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US")
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`
}
