import type { Edition, Geometry, Network, Position, Section } from "./schema"
import {
  DEFAULT_REQUIRED,
  groupStatus,
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

/**
 * One group of the list: a pipeline with its sections, or the sections that
 * are in no pipeline and are first seen in one edition.
 */
export interface PipelineSummary {
  id: string
  /** null for sections that are in no pipeline. */
  code: string | null
  name: string
  /** The sections are in no pipeline. */
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

export function sectionsInEdition(
  network: Network,
  editionId: string
): Section[] {
  return network.sections.filter((s) => s.editionIds.includes(editionId))
}

/** Sections that other editions show and this one does not. Drawn as ghosts. */
export function sectionsOutsideEdition(
  network: Network,
  editionId: string
): Section[] {
  return network.sections.filter((s) => !s.editionIds.includes(editionId))
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

/** The id of the group of sections in no pipeline, first seen in an edition. */
export function firstSeenGroupId(editionId: string): string {
  return `${UNASSIGNED_ID}:${editionId}`
}

/**
 * The groups of the list for the edition in force: one summary per pipeline
 * that has a section in the edition, in file order, then the sections that
 * are in no pipeline, one group per edition that first shows them, oldest
 * first. Data with no pipelines at all is only those last groups.
 */
export function summarise(
  network: Network,
  editionId: string,
  rule: StatusRule = DEFAULT_REQUIRED
): PipelineSummary[] {
  const build = (
    id: string,
    code: string | null,
    name: string,
    sections: Section[],
    firstSeen: Edition | null = null
  ): PipelineSummary => {
    const counts = statusCounts(sections, rule)
    return {
      id,
      code,
      name,
      unassigned: firstSeen !== null,
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
  for (const section of sectionsInEdition(network, editionId)) {
    if (section.pipelineId !== null) {
      push(byPipeline, section.pipelineId, section)
      continue
    }
    const first = firstEdition(network, section)
    if (first) push(byEdition, first.id, section)
  }

  const out: PipelineSummary[] = []
  for (const pipeline of network.pipelines) {
    const sections = byPipeline.get(pipeline.id)
    if (sections) {
      out.push(build(pipeline.id, pipeline.code, pipeline.name, sections))
    }
  }
  for (const edition of [...network.editions].sort((a, b) => a.year - b.year)) {
    const sections = byEdition.get(edition.id)
    if (sections) {
      out.push(
        build(
          firstSeenGroupId(edition.id),
          null,
          `Not in a pipeline, ${edition.label}`,
          sections,
          edition
        )
      )
    }
  }
  return out
}

/** The attribute that holds the company, and the one that holds the build year. */
export const COMPANY_ATTRIBUTE = "Owner"
export const BUILD_DATE_ATTRIBUTE = "Build date"

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
  /** The status rule: the attributes that must be cited. */
  rule: StatusRule
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
  rule: DEFAULT_REQUIRED,
}

const valueOf = (section: Section, attribute: string) =>
  section.claims.find((claim) => claim.attribute === attribute)?.value ?? null

/** The company a section is cited as belonging to; null when Unknown. */
export function companyOf(section: Section): string | null {
  return valueOf(section, COMPANY_ATTRIBUTE)
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
    criteria.needsDecision
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
    const company = companyOf(section)
    if (company === null || !companies.includes(company)) return false
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
  return true
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

/** Each company of the edition with how many pipelines it has a section in. */
export function companyCounts(
  summaries: PipelineSummary[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const summary of summaries) {
    const names = new Set(
      summary.sections.flatMap((section) => companyOf(section) ?? [])
    )
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
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
        fold(summary.code ?? "").includes(needle))
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
