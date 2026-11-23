import {
  COMPANY_ATTRIBUTE,
  DIAMETER_ATTRIBUTE,
  formatCount,
  lengthKm,
  pipelineLabel,
  sectionLabel,
  sectionStats,
} from "./derive"
import { LAST_SEEN_ATTRIBUTE } from "./evidence"
import type { Network, Section } from "./schema"

/** One row of the card: null is Unknown. */
export interface SectionFact {
  label: string
  value: string | null
}

/**
 * The basic facts about one section, as the hover card says them (Figma
 * section 27, `524:23541`): what it goes by, its pipeline, then a fixed list
 * of rows. Nothing here counts cited facts, and a proposed value is never a
 * value: it only adds to `proposals`.
 */
export interface SectionFacts {
  /** The section's name, or its code when no source names it. */
  title: string
  /** The code beside a name; null when the title is the code already. */
  code: string | null
  /** "Calder Valley · P-012", a pipeline's code alone, or "In no pipeline". */
  pipeline: string
  facts: SectionFact[]
  /** Proposals waiting on the section: values, and ends or cuts. */
  proposals: number
}

export const NO_PIPELINE = "In no pipeline"
const FIRST_SEEN_ATTRIBUTE = "First seen"

/** "8.4 km" under ten, "112 km" from there: a traced line is no surveyed one. */
export function formatLength(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${formatCount(Math.round(km))} km`
}

export function sectionFacts(
  section: Section,
  network: Pick<Network, "pipelines">
): SectionFacts {
  const pipeline = section.pipelineId
    ? network.pipelines.find((p) => p.id === section.pipelineId)
    : undefined
  // Owner is the pipeline's claim, never the section's own.
  const owners = [
    ...new Set(
      (pipeline?.claims ?? []).flatMap((claim) =>
        claim.attribute === COMPANY_ATTRIBUTE && claim.value !== null
          ? [claim.value]
          : []
      )
    ),
  ]
  const valueOf = (attribute: string) =>
    section.values.find((row) => row.attribute === attribute)?.value ?? null
  return {
    title: sectionLabel(section),
    code: section.name === null ? null : section.code,
    pipeline: pipeline
      ? pipeline.name === null
        ? pipeline.code
        : `${pipelineLabel(pipeline)} · ${pipeline.code}`
      : NO_PIPELINE,
    facts: [
      // A named section says its name in the title.
      ...(section.name === null ? [{ label: "Name", value: null }] : []),
      {
        label: COMPANY_ATTRIBUTE,
        value: owners.length > 0 ? owners.join(", ") : null,
      },
      { label: DIAMETER_ATTRIBUTE, value: valueOf(DIAMETER_ATTRIBUTE) },
      { label: FIRST_SEEN_ATTRIBUTE, value: valueOf(FIRST_SEEN_ATTRIBUTE) },
      { label: LAST_SEEN_ATTRIBUTE, value: valueOf(LAST_SEEN_ATTRIBUTE) },
      { label: "Length", value: formatLength(lengthKm(section)) },
    ],
    proposals: sectionStats(section).proposals,
  }
}
