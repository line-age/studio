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

export const MONTHS = [
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

export interface DateParts {
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

/** "1929", "March 1929" or "15 March 1929", the words a date reads as. */
export function words({ year, month, day }: DateParts): string {
  if (month === undefined) return String(year)
  const named = `${MONTHS[month - 1]} ${year}`
  return day === undefined ? named : `${day} ${named}`
}

const MONTH_NAME = new RegExp(`(${MONTHS.join("|")})`)

/**
 * A claim value that embeds a date, read by a person rather than a form: the
 * words format exactly ("March 1929"), or failing that the first year found
 * ("1929 edition" reads as 1929). Anything in the text besides the date comes
 * back as `remainder`, trimmed of the stray punctuation left behind. `null`
 * when no date can be found at all.
 */
export function findEmbeddedDate(
  text: string
): { date: DateParts; remainder: string } | null {
  const exactDay = new RegExp(`^(\\d{1,2}) ${MONTH_NAME.source} (\\d{4})$`)
  const dayMatch = exactDay.exec(text.trim())
  if (dayMatch) {
    return {
      date: {
        day: Number(dayMatch[1]),
        month: MONTHS.indexOf(dayMatch[2]) + 1,
        year: Number(dayMatch[3]),
      },
      remainder: "",
    }
  }
  const exactMonth = new RegExp(`^${MONTH_NAME.source} (\\d{4})$`)
  const monthMatch = exactMonth.exec(text.trim())
  if (monthMatch) {
    return {
      date: {
        month: MONTHS.indexOf(monthMatch[1]) + 1,
        year: Number(monthMatch[2]),
      },
      remainder: "",
    }
  }
  const yearToken = /\b(1[89]\d{2}|20\d{2})\b/.exec(text)
  if (!yearToken) return null
  const remainder = text
    .slice(0, yearToken.index)
    .concat(text.slice(yearToken.index + yearToken[0].length))
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  return { date: { year: Number(yearToken[0]) }, remainder }
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

/** A section's own identity line, for the citation pop-up's header. */
export function featureIdentity(section: Section): string {
  return section.name ?? "Unnamed gas section"
}

/**
 * Citations at the very same place in the very same source count as one: the
 * id where there is one, else the source and the place in it.
 */
function citationKey(citation: Citation): string {
  return citation.id ?? `${citation.source}|${citation.locator ?? ""}`
}

/** One source, with every citation of the open claim that names it. */
export interface SourceGroup {
  key: string
  source: string
  citations: Citation[]
}

/**
 * The open claim's citations, one row per source: the source's id where it
 * has one, else its own name, keeps the same source from splitting in two.
 */
export function groupBySource(citations: readonly Citation[]): SourceGroup[] {
  const order: string[] = []
  const bySource = new Map<string, Citation[]>()
  for (const citation of citations) {
    const key = citation.sourceId ?? citation.source
    if (!bySource.has(key)) {
      order.push(key)
      bySource.set(key, [])
    }
    bySource.get(key)!.push(citation)
  }
  return order.map((key) => {
    const group = bySource.get(key)!
    return { key, source: group[0].source, citations: group }
  })
}

/** "2 passages" once a source is cited more than once; nothing for one. */
export function passagesWords(count: number): string | undefined {
  return count > 1 ? `${count} passages` : undefined
}

/** How a citation's source is shown: a reachable page, or not. Scan follows later. */
export type ViewerKind = "web" | "unavailable"

/**
 * web once there is somewhere to send a reader (a url, an archived copy) or a
 * passage to show; unavailable otherwise, including every scan today.
 */
export function viewerKindFor(citation: Citation): ViewerKind {
  const reachable =
    citation.url !== undefined ||
    citation.archiveUrl !== undefined ||
    citation.quote !== undefined
  return reachable ? "web" : "unavailable"
}

/** "No quote, scanned map" for a scan citation that carries no passage. */
export function noQuoteWords(citation: Citation): string | undefined {
  return citation.sourceKind === "map_sheet" && citation.quote === undefined
    ? "No quote, scanned map"
    : undefined
}

/**
 * How many of the section's claims this citation backs (derived First seen
 * and Last seen claims included): the route and status claims a map sheet
 * both shows and dates often share the very same citation.
 */
export function supportsCountFor(section: Section, citation: Citation): number {
  const key = citationKey(citation)
  return section.claims.filter((claim) =>
    claim.citations.some((c) => citationKey(c) === key)
  ).length
}

/** "Supports 3 claims" once a citation backs more than one; nothing for one. */
export function supportsWords(count: number): string | undefined {
  return count > 1 ? `Supports ${count} claims` : undefined
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
