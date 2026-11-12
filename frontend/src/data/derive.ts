import type { Geometry, Network, Position, Section } from "./schema"

/*
 * Everything the screen shows that is not stored: counts, status, what is in
 * view, what a search matches. Pure functions, so they are easy to test and
 * the same answers will hold when the data comes from an API.
 */

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number]

export const UNASSIGNED_ID = "unassigned"

export type ShowFilter = "all" | "unknown" | "proposals" | "changed"

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

export interface PipelineSummary {
  id: string
  /** null for the "Not in a pipeline" group. */
  code: string | null
  name: string
  unassigned: boolean
  sections: Section[]
  stats: Stats
  changed: boolean
  bounds: Bounds | null
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

/**
 * One summary per pipeline that has a section in the edition, in file order,
 * then the sections that are in no pipeline, as one last group.
 */
export function summarise(
  network: Network,
  editionId: string
): PipelineSummary[] {
  const byPipeline = new Map<string, Section[]>()
  const unassigned: Section[] = []
  for (const section of sectionsInEdition(network, editionId)) {
    if (section.pipelineId === null) {
      unassigned.push(section)
      continue
    }
    const list = byPipeline.get(section.pipelineId)
    if (list) list.push(section)
    else byPipeline.set(section.pipelineId, [section])
  }

  const build = (
    id: string,
    code: string | null,
    name: string,
    sections: Section[]
  ): PipelineSummary => ({
    id,
    code,
    name,
    unassigned: code === null,
    sections,
    stats: sumStats(sections),
    changed: sections.some((s) => s.changedSinceReview),
    bounds: unionBounds(sections.map((s) => geometryBounds(s.geometry))),
  })

  const out: PipelineSummary[] = []
  for (const pipeline of network.pipelines) {
    const sections = byPipeline.get(pipeline.id)
    if (sections) {
      out.push(build(pipeline.id, pipeline.code, pipeline.name, sections))
    }
  }
  if (unassigned.length > 0) {
    out.push(build(UNASSIGNED_ID, null, "Not in a pipeline", unassigned))
  }
  return out
}

export function matchesShow(
  summary: PipelineSummary,
  show: ShowFilter
): boolean {
  switch (show) {
    case "all":
      return true
    case "unknown":
      return summary.stats.unknown > 0
    case "proposals":
      return summary.stats.proposals > 0
    case "changed":
      return summary.changed
  }
}

/**
 * True when the pipeline has a section whose value for one of these
 * attributes is Unknown. No attributes means no narrowing.
 */
export function matchesUnknownIn(
  summary: PipelineSummary,
  attributes: readonly string[]
): boolean {
  if (attributes.length === 0) return true
  return summary.sections.some((section) =>
    section.claims.some(
      (claim) => claim.value === null && attributes.includes(claim.attribute)
    )
  )
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

export function showCounts(
  summaries: PipelineSummary[]
): Record<ShowFilter, number> {
  const counts: Record<ShowFilter, number> = {
    all: 0,
    unknown: 0,
    proposals: 0,
    changed: 0,
  }
  for (const summary of summaries) {
    for (const key of Object.keys(counts) as ShowFilter[]) {
      if (matchesShow(summary, key)) counts[key] += 1
    }
  }
  return counts
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
  filters: {
    show: ShowFilter
    view: Bounds | null
    unknownIn?: readonly string[]
  }
): PipelineSummary[] {
  return summaries.filter(
    (s) =>
      matchesShow(s, filters.show) &&
      matchesUnknownIn(s, filters.unknownIn ?? []) &&
      inView(s, filters.view)
  )
}

export type SearchMatch =
  | { kind: "pipeline"; sections: number }
  | { kind: "section"; sectionId: string; name: string; code: string }
  | { kind: "sections"; count: number }
  | { kind: "claim"; attribute: string; value: string; sections: number }
  | { kind: "unknown"; attributes: string[]; sections: number }

/** One section a search found, and why when it was not its own name. */
export interface SectionMatch {
  sectionId: string
  name: string
  code: string
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

/**
 * Search the given pipelines: by pipeline name or code, section name or code,
 * and cited value. A query with the word "unknown" finds sections with an
 * Unknown fact instead; more words narrow it to an attribute ("unknown owner").
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
          name: section.name,
          code: section.code,
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

    const matched = summary.sections.filter(
      (s) => fold(s.name).includes(needle) || fold(s.code).includes(needle)
    )
    if (matched.length === 1) {
      const [s] = matched
      matches.push({
        kind: "section",
        sectionId: s.id,
        name: s.name,
        code: s.code,
      })
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
      const byName =
        fold(section.name).includes(needle) ||
        fold(section.code).includes(needle)
      const claim = section.claims.find(
        (c) => c.value !== null && fold(c.value).includes(needle)
      )
      if (!byName && !claim) continue
      sections.push({
        sectionId: section.id,
        name: section.name,
        code: section.code,
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
