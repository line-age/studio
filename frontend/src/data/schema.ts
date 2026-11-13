import { z } from "zod"

/*
 * The fixture format, version 1. docs/fixtures.md explains it in words.
 *
 * Terms follow controlplane/glossary.md: a section is a continuous stretch of
 * line; a claim is one statement about one attribute of one section; a
 * citation points at the source that supports a claim. The interface uses the
 * same words.
 */

const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

const lineString = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(position).min(2),
})

const multiLineString = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(position).min(2)).min(1),
})

const geometry = z.discriminatedUnion("type", [lineString, multiLineString])

const citation = z.object({
  /** What is cited, as a person would write it: a map edition, a journal issue. */
  source: z.string().min(1),
  /** Where in the source: page, grid reference. */
  locator: z.string().min(1).optional(),
  /** The passage in the source's own words (an attestation). */
  quote: z.string().min(1).optional(),
})

const proposal = z.object({
  value: z.string().min(1),
  citation,
})

const claim = z
  .object({
    attribute: z.string().min(1),
    /** null means Unknown. Never an empty string, a dash or a guess. */
    value: z.string().min(1).nullable(),
    citations: z.array(citation).default([]),
    /** What the AI proposes. Shown, never applied. */
    proposals: z.array(proposal).default([]),
  })
  .superRefine((c, ctx) => {
    if (c.value !== null && c.citations.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "A value needs at least one citation. Without one, set value to null (Unknown).",
        path: ["citations"],
      })
    }
    if (c.value === null && c.citations.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "An Unknown claim (value null) cannot carry citations.",
        path: ["citations"],
      })
    }
  })

const edition = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  label: z.string().min(1),
})

const pipeline = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
})

const section = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  /** null: no source names the section yet. It goes by its code. */
  name: z.string().min(1).nullable(),
  /** null: the section is not in a pipeline yet. */
  pipelineId: z.string().min(1).nullable(),
  /** The editions that show this section. */
  editionIds: z.array(z.string().min(1)).min(1),
  geometry,
  claims: z.array(claim),
  changedSinceReview: z.boolean().default(false),
  /** The day the section's record was added to Lineage, "2026-11-12". */
  addedAt: z.iso.date().optional(),
})

const proposedPath = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1).nullable(),
  editionIds: z.array(z.string().min(1)).min(1),
  geometry,
})

const note = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  sectionId: z.string().min(1),
  position,
  text: z.string().min(1),
  quote: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
})

const threadItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("marker"),
    text: z.string().min(1),
    separator: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("user"),
    text: z.string().min(1),
    attachment: z
      .object({
        sectionId: z.string().min(1),
        attribute: z.string().min(1).optional(),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("assistant"),
    text: z.string().min(1),
    noteIds: z.array(z.string().min(1)).default([]),
    proposal: z
      .object({
        sectionId: z.string().min(1),
        attribute: z.string().min(1),
      })
      .optional(),
  }),
])

export const networkSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    editions: z.array(edition).min(1),
    pipelines: z.array(pipeline),
    sections: z.array(section),
    proposedPaths: z.array(proposedPath).default([]),
    notes: z.array(note).default([]),
    agentThread: z.array(threadItem).default([]),
  })
  .superRefine((n, ctx) => {
    const unique = (items: { id: string }[], path: string) => {
      const seen = new Set<string>()
      items.forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate id "${item.id}".`,
            path: [path, i, "id"],
          })
        }
        seen.add(item.id)
      })
      return seen
    }
    const editionIds = unique(n.editions, "editions")
    const pipelineIds = unique(n.pipelines, "pipelines")
    const sectionIds = unique(n.sections, "sections")
    unique(n.proposedPaths, "proposedPaths")
    unique(n.notes, "notes")

    const checkEditions = (ids: string[], path: (string | number)[]) =>
      ids.forEach((id, j) => {
        if (!editionIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `No edition with id "${id}".`,
            path: [...path, "editionIds", j],
          })
        }
      })

    n.sections.forEach((s, i) => {
      if (s.pipelineId !== null && !pipelineIds.has(s.pipelineId)) {
        ctx.addIssue({
          code: "custom",
          message: `No pipeline with id "${s.pipelineId}".`,
          path: ["sections", i, "pipelineId"],
        })
      }
      checkEditions(s.editionIds, ["sections", i])
    })
    n.proposedPaths.forEach((p, i) => {
      if (p.sectionId !== null && !sectionIds.has(p.sectionId)) {
        ctx.addIssue({
          code: "custom",
          message: `No section with id "${p.sectionId}".`,
          path: ["proposedPaths", i, "sectionId"],
        })
      }
      checkEditions(p.editionIds, ["proposedPaths", i])
    })
    n.notes.forEach((note, i) => {
      if (!sectionIds.has(note.sectionId)) {
        ctx.addIssue({
          code: "custom",
          message: `No section with id "${note.sectionId}".`,
          path: ["notes", i, "sectionId"],
        })
      }
    })
  })

export type Network = z.infer<typeof networkSchema>
export type Edition = Network["editions"][number]
export type Pipeline = Network["pipelines"][number]
export type Section = Network["sections"][number]
export type Claim = Section["claims"][number]
export type Citation = Claim["citations"][number]
export type Proposal = Claim["proposals"][number]
export type ProposedPath = Network["proposedPaths"][number]
export type Note = Network["notes"][number]
export type ThreadItem = Network["agentThread"][number]
export type Geometry = Section["geometry"]
export type Position = z.infer<typeof position>

export class FixtureError extends Error {
  readonly detail: string
  constructor(message: string, detail = "") {
    super(message)
    this.name = "FixtureError"
    this.detail = detail
  }
}

/** Parse unknown JSON into a Network, or throw a FixtureError that says what is wrong. */
export function parseNetwork(input: unknown): Network {
  const result = networkSchema.safeParse(input)
  if (!result.success) {
    throw new FixtureError(
      "The fixture file does not match the format.",
      z.prettifyError(result.error)
    )
  }
  return result.data
}
