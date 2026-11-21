import type { Claim, Section, SectionDetail } from "./schema"

/*
 * How a data function finds a section's detail (claims, citations, proposed
 * ends in full) without reading any store itself: it is handed a lookup. The
 * sample's sections hold their own; on store's data the screen passes one
 * that reads src/data/detail-store.ts.
 */

export type DetailLookup = (
  section: Pick<Section, "id" | "claims" | "proposedEnds">
) => SectionDetail | null

/** A section's own detail only: the sample's, and tests'. */
export const ownDetail: DetailLookup = (section) =>
  section.claims
    ? { claims: section.claims, proposedEnds: section.proposedEnds }
    : null

/** A section's claims through a lookup; none while they are not read. */
export function claimsWith(
  details: DetailLookup,
  section: Pick<Section, "id" | "claims" | "proposedEnds">
): Claim[] {
  return details(section)?.claims ?? []
}
