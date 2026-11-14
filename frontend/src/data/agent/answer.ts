import { z } from "zod"

/*
 * The answer the Agent service gives (studio/agent/contract/answer.schema.json).
 * Only an answer the service checked against store is shown.
 */

export const agentAnswerRef = z.object({
  type: z.enum([
    "claim",
    "citation",
    "link",
    "feature",
    "source",
    "help",
    "set",
  ]),
  id: z.string().min(1),
  feature_id: z.string().nullable().optional(),
  attribute: z.string().nullable().optional(),
  status: z
    .enum(["accepted", "candidate", "rejected", "proposed", "confirmed"])
    .nullable()
    .optional(),
  asserter: z.enum(["person", "pipeline"]).nullable().optional(),
  /** What it opens, named by the service from what it read. */
  label: z.string().nullable().optional(),
})

/** The fixed rules a lead is found by (studio/agent/schemas.py, LeadRule). */
const leadRule = z.enum([
  "neighbour_source",
  "neighbour_owner",
  "pipeline_claims",
  "edition_window",
  "proposed_link",
  "rejected_value",
  "conflict",
])

export const agentStatement = z.object({
  kind: z.enum([
    "fact",
    "unknown",
    "set",
    "reading",
    "help",
    "clarify",
    "refusal",
    "greeting",
    "failure",
    "citation_request",
    // Worked out by code from what store holds, never a claim.
    "worked_out",
    // Somewhere to look, found by code by a fixed rule: "Not in store".
    "lead",
  ]),
  text: z.string(),
  refs: z.array(agentAnswerRef).default([]),
  attribute: z.string().nullable().optional(),
  /** For a citation request: what store would be asked (step 2 sends it). */
  request: z
    .object({
      feature_id: z.string(),
      attribute_keys: z.array(z.string()),
      priority: z.enum(["interactive", "background"]),
      /** The section's leads, as hints for the search. Never a claim. */
      hints: z
        .array(z.object({ rule: leadRule, text: z.string() }))
        .default([]),
    })
    .nullable()
    .optional(),
  /** For a lead: the rule that found it. */
  rule: leadRule.nullable().optional(),
})

export const agentAnswer = z.object({
  version: z.literal(1),
  checked: z.boolean(),
  statements: z.array(agentStatement),
})

export type AgentAnswer = z.infer<typeof agentAnswer>
export type AgentStatement = z.infer<typeof agentStatement>
export type AgentAnswerRef = z.infer<typeof agentAnswerRef>

/** Store's attribute keys as Studio names them. */
export const ATTRIBUTE_LABEL: Record<string, string> = {
  owner: "Owner",
  operator: "Operator",
  name: "Name",
  diameter: "Diameter",
  status: "Status",
  route: "Geometry",
}

export const STATUS_WORD: Record<string, string> = {
  accepted: "Cited",
  candidate: "Proposed",
  rejected: "Rejected",
  proposed: "Proposed",
  confirmed: "Confirmed",
}
