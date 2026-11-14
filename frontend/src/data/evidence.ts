import type { Citation, CitationRole, ProposedEnd, Section } from "./schema"

/*
 * How evidence is put into words: what a source does for a claim, the dates a
 * source gives, and an end or cut a tool proposes. Pure functions.
 *
 * A date here is what a source says, never a build date: "by August 1929"
 * (the line was there by then), "between 1929 and 1931", never a bare year.
 */

/**
 * The row that says which pipeline a section is in. Not a claim with a
 * source: membership is a judgement a person confirms.
 */
export const PIPELINE_ROW = "Pipeline"
/** The row that sends a reader to the pipeline's owner claim. */
export const OWNER_ROW = "Owner"
export const LAST_SEEN_ATTRIBUTE = "Last seen"
export const GEOMETRY_ATTRIBUTE = "Geometry"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

interface DateParts {
  year: number
  month?: number
  day?: number
}

/** "1929", "1929-08" or "1929-08-15"; anything else is not read. */
function parseDate(text: string): DateParts | null {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(text.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] === undefined ? undefined : Number(match[2])
  const day = match[3] === undefined ? undefined : Number(match[3])
  if (month !== undefined && (month < 1 || month > 12)) return null
  if (day !== undefined && (day < 1 || day > 31)) return null
  return { year, month, day }
}

function words({ year, month, day }: DateParts): string {
  if (month === undefined) return String(year)
  const named = `${MONTHS[month - 1]} ${year}`
  return day === undefined ? named : `${day} ${named}`
}

/** The year a date falls in, or null when it has none Studio can read. */
export function yearOf(date: string | null | undefined): number | null {
  const year = date?.match(/\d{4}/)?.[0]
  return year ? Number(year) : null
}

/**
 * The period a claim holds for, in words: "by August 1929", "between August
 * 1929 and 1931", "from 1931", "in 1931". A form Studio cannot read is given
 * back as written rather than guessed at.
 */
export function formatValid(valid: string): string {
  const parts = valid.split("/")
  const open = (part: string) => part === "" || part === ".."
  if (parts.length === 1) {
    const date = parseDate(parts[0])
    if (!date) return valid
    return `${date.day === undefined ? "in" : "on"} ${words(date)}`
  }
  if (parts.length !== 2) return valid
  const [from, to] = parts
  const start = open(from) ? null : parseDate(from)
  const end = open(to) ? null : parseDate(to)
  if ((!open(from) && !start) || (!open(to) && !end)) return valid
  if (start && end) return `between ${words(start)} and ${words(end)}`
  if (end) return `by ${words(end)}`
  if (start) return `from ${words(start)}`
  return valid
}

/** A map's date in full: "as of 31 December 1953" for "1953". */
export function formatAsOf(asOf: string): string {
  const date = parseDate(asOf)
  if (!date) return `as of ${asOf}`
  const month = date.month ?? 12
  // Day 0 of the next month is the last day of this one.
  const day = date.day ?? new Date(Date.UTC(date.year, month, 0)).getUTCDate()
  return `as of ${words({ year: date.year, month, day })}`
}

const ROLE_WORDS: Record<CitationRole, string> = {
  map_shows: "Shown on",
  map_omits: "Not on",
  states: "States",
  confirms: "Confirms",
}

/** What the source does for the claim, in words; undefined when not recorded. */
export function roleWords(role: CitationRole | undefined): string | undefined {
  return role === undefined ? undefined : ROLE_WORDS[role]
}

/** A map citation's edition and date: "1953 edition, as of 31 December 1953". */
export function editionWords(citation: Citation): string | undefined {
  const year = yearOf(citation.asOf)
  if (citation.asOf === undefined || year === null) return undefined
  return `${year} edition, ${formatAsOf(citation.asOf)}`
}

/** The day a claim was made, in words: "13 November 2026". */
export function formatMadeAt(madeAt: string): string {
  const date = parseDate(madeAt)
  return date ? words(date) : madeAt
}

/** A citation's confidence as recorded, from 0 to 1: "0.8". */
export function confidenceWords(confidence: number): string {
  return `${String(Number(confidence.toFixed(2)))} of 1`
}

/** A citation as one line: what it does, the source, the place, the passage. */
export function citationLine(citation: Citation): string {
  const role = roleWords(citation.role)
  const source = role ? `${role} ${citation.source}` : citation.source
  const where =
    citation.locator === undefined ? source : `${source}, ${citation.locator}`
  return citation.quote === undefined
    ? `${where}.`
    : `${citation.quote} ${where}.`
}

/** What a map says about a line it shows: "Shown by August 1929". */
export function shownBy(citation: Citation): string | null {
  if (citation.role !== "map_shows" || citation.asOf === undefined) return null
  const date = parseDate(citation.asOf)
  return date ? `Shown by ${words(date)}` : null
}

/**
 * The ends or cuts proposed for a section that belong on one claim: an end on
 * Last seen, a cut on Geometry. Any other attribute has none.
 */
export function proposedEndsFor(
  section: Section,
  attribute: string
): ProposedEnd[] {
  const kind =
    attribute === LAST_SEEN_ATTRIBUTE
      ? "end"
      : attribute === GEOMETRY_ATTRIBUTE
        ? "cut"
        : null
  return kind === null
    ? []
    : section.proposedEnds.filter((end) => end.kind === kind)
}

/** Every proposal waiting on one claim: candidate values, ends and cuts. */
export function proposalCount(
  section: Section,
  claim: Section["claims"][number]
): number {
  return (
    claim.proposals.length + proposedEndsFor(section, claim.attribute).length
  )
}

/** A proposed membership in words: which pipeline, by which tool, how sure. */
export function proposedMembershipWords(
  proposed: { score: number; proposer?: string },
  pipeline: { name: string | null; code: string }
): string {
  const who = proposed.proposer ? `The ${proposed.proposer} tool` : "A tool"
  const which =
    pipeline.name === null
      ? `${pipeline.code}, whose name is Unknown`
      : `${pipeline.name} (${pipeline.code})`
  return `${who} proposes that this section is part of ${which}. Score ${proposed.score.toFixed(2)}. Nobody has confirmed it, so the section is in no pipeline.`
}

/** A proposed end or cut in words: what, by which tool, how sure. */
export function proposedEndWords(end: ProposedEnd): string {
  const who = end.proposer ? `The ${end.proposer} tool` : "A tool"
  const year = (role: CitationRole) =>
    yearOf(end.citations.find((c) => c.role === role)?.asOf)
  const shown = year("map_shows")
  const gone = year("map_omits")
  const dated = shown !== null && gone !== null
  const score = `Score ${end.score.toFixed(2)}.`
  if (end.kind === "end") {
    return [
      dated
        ? `${who} proposes ${shown}, not on ${gone}.`
        : `${who} proposes that this section ends.`,
      dated
        ? "A line traced as gone between the two editions runs along this whole section."
        : "A line traced as gone runs along this whole section.",
      score,
    ].join(" ")
  }
  return [
    `${who} proposes to cut this section in two.`,
    dated
      ? `A line traced as gone between the ${shown} and ${gone} editions runs along part of it: one part would end, the other carry on.`
      : "A line traced as gone runs along part of it: one part would end, the other carry on.",
    score,
  ].join(" ")
}
