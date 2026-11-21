import type { AgentRef } from "@/data/question"
import { membershipRefs, proposalRefs, STARTERS } from "@/data/question"
import type { DetailLookup } from "@/data/detail"
import type { Claim, Section } from "@/data/schema"

import type { Starter } from "./add-to-agent"

/*
 * Which questions a person can start from a thing: what store says, why
 * something is Unknown, what is proposed and why, what surrounds a section,
 * where to look next, and, on a section, a search of the journals. None
 * changes a claim: a finding reaches store only by its Propose button.
 */

/** On a claim: what store says; why it is Unknown; what is proposed. */
export function claimStarters(
  claim: Pick<Claim, "value">,
  proposals: readonly AgentRef[] = []
): Starter[] {
  return [
    { words: STARTERS.say },
    ...(claim.value === null ? [{ words: STARTERS.unknown }] : []),
    ...(proposals.length > 0
      ? [{ words: STARTERS.proposed, refs: proposals }]
      : []),
  ]
}

/** On a section's claim, with the proposals that wait on it. */
export function sectionClaimStarters(
  section: Section,
  claim: Pick<Claim, "attribute" | "value">,
  details?: DetailLookup
): Starter[] {
  return claimStarters(claim, proposalRefs(section, claim.attribute, details))
}

/** On a section's Pipeline row: what store says, and any pipeline proposed. */
export function pipelineRowStarters(section: Section): Starter[] {
  const proposed = membershipRefs(section)
  return [
    { words: STARTERS.say },
    ...(section.pipelineId === null && proposed.length === 0
      ? [{ words: STARTERS.unknown }]
      : []),
    ...(proposed.length > 0
      ? [{ words: STARTERS.proposed, refs: proposed }]
      : []),
  ]
}
