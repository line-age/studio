import type { Section } from "./schema"

/*
 * The status of a section: how far the work on it has come. Computed from its
 * claims and from whether it is in a pipeline; never stored.
 *
 *  - Not started: none of the required attributes is cited.
 *  - In progress: some are cited, not all.
 *  - Sufficient: all are cited, and the section is not in a pipeline.
 *  - Done: all are cited, and the section is in a pipeline.
 *
 * An attribute that was looked for and not found stays Unknown, so it counts
 * as not cited. Which attributes are required is a setting (the rule).
 */

export const STATUSES = [
  "not-started",
  "in-progress",
  "sufficient",
  "done",
] as const

export type SectionStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<SectionStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  sufficient: "Sufficient",
  done: "Done",
}

/** The rule: the attributes that must be cited for sufficient data. */
export type StatusRule = readonly string[]

export const DEFAULT_REQUIRED: StatusRule = ["Diameter", "Build date"]

/**
 * Claims that are made about a pipeline, not about its sections. Never part
 * of the rule: a section cannot be missing what it does not carry.
 */
export const ON_PIPELINE: readonly string[] = ["Name", "Owner", "Operator"]

/** Attributes every section has by being a section. Never part of the rule. */
export const ALWAYS_PRESENT: readonly string[] = ["First seen", "Geometry"]

export type StatusCounts = Record<SectionStatus, number>

const noCounts = (): StatusCounts => ({
  "not-started": 0,
  "in-progress": 0,
  sufficient: 0,
  done: 0,
})

/** The required attributes the section has no cited value for. */
export function missingRequired(section: Section, rule: StatusRule): string[] {
  return rule.filter(
    (attribute) =>
      !section.claims.some(
        (claim) => claim.attribute === attribute && claim.value !== null
      )
  )
}

export function sectionStatus(
  section: Section,
  rule: StatusRule = DEFAULT_REQUIRED
): SectionStatus {
  const missing = missingRequired(section, rule).length
  if (missing === 0) {
    return section.pipelineId === null ? "sufficient" : "done"
  }
  // An empty rule never gets here: nothing can be missing from it.
  return missing === rule.length ? "not-started" : "in-progress"
}

/** A proposal is waiting on a claim of the section. A mark, not a status. */
export function needsDecision(section: Section): boolean {
  return (
    section.proposedEnds.length > 0 ||
    section.proposedMemberships.length > 0 ||
    section.claims.some((claim) => claim.proposals.length > 0)
  )
}

export function statusCounts(
  sections: readonly Section[],
  rule: StatusRule = DEFAULT_REQUIRED
): StatusCounts {
  const counts = noCounts()
  for (const section of sections) counts[sectionStatus(section, rule)] += 1
  return counts
}

/**
 * One word for a group of sections. Done only when every section is done,
 * Not started only when none has begun; Sufficient when every one has
 * sufficient data and none is in a pipeline. Anything mixed is In progress.
 */
export function groupStatus(counts: StatusCounts): SectionStatus {
  const total =
    counts["not-started"] +
    counts["in-progress"] +
    counts.sufficient +
    counts.done
  if (total === 0 || counts["not-started"] === total) return "not-started"
  if (counts.done === total) return "done"
  if (counts.sufficient === total) return "sufficient"
  return "in-progress"
}

/** For each required attribute, how many of the sections have it Unknown. */
export function unknownByAttribute(
  sections: readonly Section[],
  rule: StatusRule = DEFAULT_REQUIRED
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const attribute of rule) out[attribute] = 0
  for (const section of sections) {
    for (const attribute of missingRequired(section, rule)) out[attribute] += 1
  }
  return out
}
