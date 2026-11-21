import { parseNetwork, type Network } from "@/data/schema"
import type {
  StoreFeature,
  StoreLink,
  StoreSectionRow,
} from "@/data/store/client"
import { toDetail, toSummary } from "@/data/store/to-network"

/**
 * For tests: the whole network with every section's detail in it, as the
 * sample has it. The values stay the list's: a test compares them with the
 * claims.
 */
export function toNetwork(
  name: string,
  rows: readonly StoreSectionRow[],
  features: readonly StoreFeature[],
  {
    links = [],
    lines = [],
    removals = [],
  }: {
    links?: readonly StoreLink[]
    lines?: readonly StoreFeature[]
    removals?: readonly StoreFeature[]
  } = {}
): Network {
  const summary = toSummary(name, rows, { links, lines })
  const featureById = new Map(features.map((f) => [f.id, f]))
  return parseNetwork({
    ...summary,
    sections: summary.sections.map((section) => {
      const feature = featureById.get(section.id)
      if (!feature) return section
      const detail = toDetail(feature, section, removals)
      return {
        ...section,
        claims: detail.claims,
        proposedEnds: detail.proposedEnds,
      }
    }),
  })
}
