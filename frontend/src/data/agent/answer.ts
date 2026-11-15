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
  /** For a claim: its source and page, shown beside the statement; null when none. */
  source: z.string().nullable().optional(),
  /** For a claim: the quoted passage and a link to the source, shown on hover. */
  quote: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  /** For a claim: what its source does for it, and a map's as-of date (EDTF). */
  role: z.string().nullable().optional(),
  as_of: z.string().nullable().optional(),
})

/**
 * One thing the Agent did for an answer, in plain words (its chain of thought).
 * `by: "cite"` marks a line from a search of the journals.
 */
export const agentStep = z.object({
  text: z.string(),
  done: z.boolean(),
  by: z.string().nullable().optional(),
})
export type AgentStep = z.infer<typeof agentStep>

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

/**
 * A passage cite found and checked for one attribute of one section: not in
 * store until the person presses Propose (studio/agent/schemas.py, Finding).
 */
export const agentFinding = z.object({
  handle: z.string(),
  section_id: z.string(),
  attribute: z.enum(["owner", "diameter", "built"]),
  value: z.string(),
  date_words: z.string(),
  /** The page's own words, as cite's verifier aligned them. */
  quote: z.string(),
  journal: z.string(),
  volume: z.number().nullable().optional(),
  number: z.number().nullable().optional(),
  date: z.string(),
  page: z.string(),
  url: z.string(),
  image_url: z.string().nullable().optional(),
  page_width: z.number().nullable().optional(),
  page_height: z.number().nullable().optional(),
  highlight: z
    .array(
      z.object({
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      })
    )
    .default([]),
  flags: z
    .array(z.object({ flag: z.string(), reason: z.string() }))
    .default([]),
  places_matched: z.array(z.string()).default([]),
  places_given: z.array(z.string()).default([]),
  /** Store already holds this value, with this status: then it is not new. */
  in_store: z.enum(["accepted", "candidate", "rejected"]).nullable().optional(),
  proposable: z.boolean().default(true),
  not_proposable: z.string().nullable().optional(),
})
export type AgentFinding = z.infer<typeof agentFinding>

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
    // What cite found in the journals, not in store; with the passage.
    "finding",
    // What cite searched for and did not find.
    "searched",
    // A search waits for the towns along the line.
    "ask_places",
    // A finding the person proposed, now a candidate claim in store; or a
    // pipeline the person proposed, now a line with proposed memberships.
    "proposed",
    // The attached sections could be proposed as one pipeline, on a button.
    "pipeline_offer",
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
  /** For a finding: the passage, the page and whether it may be proposed. */
  finding: agentFinding.nullable().optional(),
  /**
   * For a pipeline offer: the sections, and those already confirmed in a
   * pipeline (proposed too; they stay where they are until a person moves them).
   */
  pipeline: z
    .object({
      section_ids: z.array(z.string()),
      in_pipeline: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
})

export const agentAnswer = z.object({
  // 2 added what cite finds; 1 is what a thread saved before it still holds.
  version: z.union([z.literal(1), z.literal(2)]),
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
