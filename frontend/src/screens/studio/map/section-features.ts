import {
  hasCriteria,
  isPlaced,
  sectionMatches,
  type PipelineSummary,
  type SectionCriteria,
} from "@/data/derive"
import type { Geometry } from "@/data/schema"
import { sectionStatus } from "@/data/status"

export type SectionFeature = {
  type: "Feature"
  geometry: Geometry
  properties: { id: string; [key: string]: string | boolean }
}

/**
 * The sections the map draws, sorted by the filters: `drawn` are the ones
 * that pass, each with its status and whether it is in a pipeline (heavy) or
 * in none (thin); `faint` are the rest, shown only when the map key says so
 * and never clickable. Only the sections given are in either: what the
 * switch leaves out is handed to the map nowhere, so it is not drawn and
 * cannot be clicked, selected or not.
 */
export function sectionFeatures(
  scoped: readonly PipelineSummary[],
  criteria: SectionCriteria
): { drawn: SectionFeature[]; faint: SectionFeature[] } {
  const filtering = hasCriteria(criteria)
  const drawn: SectionFeature[] = []
  const faint: SectionFeature[] = []
  for (const summary of scoped) {
    for (const section of summary.sections) {
      if (!filtering || sectionMatches(section, criteria)) {
        drawn.push({
          type: "Feature",
          geometry: section.geometry,
          properties: {
            id: section.id,
            pipelineId: summary.id,
            status: sectionStatus(section, criteria.rule),
            placed: isPlaced(section),
          },
        })
      } else {
        faint.push({
          type: "Feature",
          geometry: section.geometry,
          properties: { id: section.id },
        })
      }
    }
  }
  return { drawn, faint }
}
