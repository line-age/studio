import type { AgentRef } from "@/data/question"
import { membershipRefs, proposalRefs, STARTERS } from "@/data/question"
import type { Claim, Section } from "@/data/schema"

import type { Starter } from "./add-to-agent"

/*
 * Which questions a person can start from a thing: what store says, why
 * something is Unknown, what is proposed and why, what surrounds a section,
 * where to look next, and, on a section, a search of the journals. None
 * changes a claim: a finding reaches store only by its Propose button.
 */

/** On a section: what store says, what surrounds it, where to look, a search. */
export function sectionStarters(): Starter[] {
  return [
    { words: STARTERS.say },
    { words: STARTERS.surrounds },
    { words: STARTERS.lookFor },
    { words: STARTERS.find },
  ]
}

/** On a claim: what store says; why it is Unknown; what is proposed. */
export function claimStarters(
  claim: Claim,
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
  claim: Claim
): Starter[] {
  return claimStarters(claim, proposalRefs(section, claim.attribute))
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
