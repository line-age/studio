import { pipelineLabel, sectionLabel } from "./derive"
import { claimsWith, ownDetail, type DetailLookup } from "./detail"
import { proposedEndsFor } from "./evidence"
import type { AgentRef, Network, Section } from "./schema"

export type { AgentRef }

/*
 * What a person asks the Agent about, and what the question carries, so the
 * service that will answer needs nothing else from the screen. Pure: no fetch.
 *
 * The service is later work. Its answer must rest only on what store holds,
 * name the claim, citation or link behind each statement, say "Store does not
 * say" where store has nothing, and write nothing.
 */

/** One key per thing, so the same thing is not attached twice. */
export function refKey(ref: AgentRef): string {
  switch (ref.kind) {
    case "claim":
      return `claim:${ref.owner}:${ref.ownerId}:${ref.attribute}:${ref.index ?? 0}`
    case "citation":
      return `citation:${ref.sectionId}:${ref.attribute}:${ref.index}`
    case "proposal":
      return `proposal:${ref.sectionId}:${ref.what}:${ref.key}`
  }
}

/** What the screen says a thing is: a title, and what it belongs to. */
export function refWords(
  ref: AgentRef,
  network: Network,
  details: DetailLookup = ownDetail
): { title: string; meta: string } {
  const section = (id: string) => network.sections.find((s) => s.id === id)
  const pipeline = (id: string) => network.pipelines.find((p) => p.id === id)
  const of = (id: string) => {
    const found = section(id)
    return found ? sectionLabel(found) : id
  }
  switch (ref.kind) {
    case "claim":
      return {
        title: ref.attribute,
        meta:
          ref.owner === "pipeline"
            ? `Claim · ${(() => {
                const found = pipeline(ref.ownerId)
                return found ? pipelineLabel(found) : ref.ownerId
              })()}`
            : `Claim · ${of(ref.ownerId)}`,
      }
    case "citation": {
      const found = section(ref.sectionId)
      const claim = found
        ? claimsWith(details, found).find((c) => c.attribute === ref.attribute)
        : undefined
      const cited = claim?.citations[ref.index]
      return {
        title: cited?.source ?? "Source",
        meta: `Source · ${ref.attribute} of ${of(ref.sectionId)}`,
      }
    }
    case "proposal":
      return {
        title:
          ref.what === "end"
            ? "Proposed end"
            : ref.what === "cut"
              ? "Proposed cut"
              : ref.what === "pipeline"
                ? "Proposed pipeline"
                : `${ref.attribute}, proposed`,
        meta: `Proposal · ${of(ref.sectionId)}`,
      }
  }
}

/** Sections attached by the pipeline or group they were picked from. */
export interface SectionsAttached {
  pipelineId: string
  sectionIds: readonly string[] | "all"
}

/** One attached thing as the service receives it: its kind and store id. */
export interface QuestionItem {
  kind: "pipeline" | "section" | "claim" | "citation" | "link"
  /** The store id, where the data has one. */
  id: string | null
  /** Where it is when it has no id: the section or pipeline and attribute. */
  on?: { sectionId?: string; pipelineId?: string; attribute?: string }
}

/** A button the person pressed: code acts on it, no model reads it. */
export interface QuestionAction {
  /**
   * propose: write a finding to store; propose_pipeline: write the sections
   * as a proposed pipeline; fresh_start: clear the messages, keep findings.
   */
  kind: "propose" | "propose_pipeline" | "fresh_start"
  /** For propose: the finding's handle in the conversation (F1). */
  finding?: string
  /**
   * For propose: where it goes, by store id. The finding's section when
   * left out; or the pipeline that section is confirmed part of, for an owner.
   */
  target?: string
  /** For propose_pipeline: the sections, by store id. */
  section_ids?: string[]
}

/** Everything a question carries. Nothing else is sent. */
export interface Question {
  words: string
  about: QuestionItem[]
  network: string
  action?: QuestionAction
}

function sectionItems(
  attached: SectionsAttached,
  network: Network
): QuestionItem[] {
  const pipeline = network.pipelines.find((p) => p.id === attached.pipelineId)
  // A whole pipeline is asked about as the pipeline itself.
  if (attached.sectionIds === "all" && pipeline) {
    return [{ kind: "pipeline", id: pipeline.id }]
  }
  const ids =
    attached.sectionIds === "all"
      ? network.sections
          .filter((s) => s.pipelineId === attached.pipelineId)
          .map((s) => s.id)
      : attached.sectionIds
  return ids.map((id) => ({ kind: "section", id }))
}

function refItem(
  ref: AgentRef,
  network: Network,
  details: DetailLookup
): QuestionItem {
  const section = (id: string): Section | undefined =>
    network.sections.find((s) => s.id === id)
  const claimsOfId = (id: string) => {
    const found = section(id)
    return found ? claimsWith(details, found) : []
  }
  switch (ref.kind) {
    case "claim": {
      const claims =
        ref.owner === "pipeline"
          ? (network.pipelines.find((p) => p.id === ref.ownerId)?.claims ?? [])
          : claimsOfId(ref.ownerId)
      const claim = claims.filter((c) => c.attribute === ref.attribute)[
        ref.index ?? 0
      ]
      return {
        kind: "claim",
        id: claim?.id ?? null,
        on: {
          [ref.owner === "pipeline" ? "pipelineId" : "sectionId"]: ref.ownerId,
          attribute: ref.attribute,
        },
      }
    }
    case "citation": {
      const cited = claimsOfId(ref.sectionId).find(
        (c) => c.attribute === ref.attribute
      )?.citations[ref.index]
      return {
        kind: "citation",
        id: cited?.id ?? null,
        on: { sectionId: ref.sectionId, attribute: ref.attribute },
      }
    }
    case "proposal": {
      const found = section(ref.sectionId)
      if (ref.what === "value") {
        const candidate = (found ? claimsWith(details, found) : []).find(
          (c) => c.attribute === ref.attribute
        )?.proposals[Number(ref.key)]
        return {
          kind: "claim",
          id: candidate?.id ?? null,
          on: { sectionId: ref.sectionId, attribute: ref.attribute },
        }
      }
      // Ends, cuts and memberships are links in store.
      return { kind: "link", id: ref.key, on: { sectionId: ref.sectionId } }
    }
  }
}

/**
 * The question as it leaves Studio: the words, each thing by kind and id.
 * `details` finds a section's claims: on store's data, read them first
 * (`ensureDetails`), or a claim goes by its section and attribute, without
 * its id.
 */
export function buildQuestion({
  words,
  sections,
  refs,
  network,
  details = ownDetail,
}: {
  words: string
  sections: readonly SectionsAttached[]
  refs: readonly AgentRef[]
  network: Network
  details?: DetailLookup
}): Question {
  return {
    words: words.trim(),
    about: [
      ...sections.flatMap((s) => sectionItems(s, network)),
      ...refs.map((ref) => refItem(ref, network, details)),
    ],
    network: network.name,
  }
}

/**
 * Every proposal waiting on one claim of a section, as references. Before
 * the section's detail is read, the list's count says how many candidates
 * wait; each is named by its place, and its id is looked up when the
 * question is built (`buildQuestion`, after `ensureDetails`).
 */
export function proposalRefs(
  section: Section,
  attribute: string,
  details: DetailLookup = ownDetail
): AgentRef[] {
  const claim = claimsWith(details, section).find(
    (c) => c.attribute === attribute
  )
  const waiting =
    claim?.proposals.length ??
    section.values.find((v) => v.attribute === attribute)?.proposals ??
    0
  return [
    ...Array.from({ length: waiting }, (_, index): AgentRef => ({
      kind: "proposal",
      sectionId: section.id,
      what: "value",
      attribute,
      key: String(index),
    })),
    ...proposedEndsFor(section, attribute).map((end): AgentRef => ({
      kind: "proposal",
      sectionId: section.id,
      what: end.kind,
      attribute,
      key: end.id,
    })),
  ]
}

/** The pipelines proposed for a section, as references. */
export function membershipRefs(section: Section): AgentRef[] {
  return section.proposedMemberships.map((m) => ({
    kind: "proposal",
    sectionId: section.id,
    what: "pipeline",
    attribute: "Pipeline",
    key: m.id,
  }))
}

/** The read-only questions a person can start from a thing. */
export const STARTERS = {
  say: "What does store say about this?",
  unknown: "Why is this Unknown?",
  proposed: "What is proposed here, and why?",
  // What code works out around a section, and the leads it finds (Figma section 13).
  surrounds: "What surrounds this section?",
  lookFor: "What could we look for here?",
  // Searches the journals with cite; the Agent asks for the towns first.
  find: "Find this in the sources",
} as const
