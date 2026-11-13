import { pipelineLabel, sectionLabel } from "./derive"
import { proposedEndsFor } from "./evidence"
import type { AgentRef, Edition, Network, Section } from "./schema"

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
  network: Network
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
      const claim = section(ref.sectionId)?.claims.find(
        (c) => c.attribute === ref.attribute
      )
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

/** Everything a question carries. Nothing else is sent. */
export interface Question {
  words: string
  about: QuestionItem[]
  /** The edition in force: what the person sees the network as of. */
  edition: { id: string; year: number }
  network: string
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

function refItem(ref: AgentRef, network: Network): QuestionItem {
  const section = (id: string): Section | undefined =>
    network.sections.find((s) => s.id === id)
  switch (ref.kind) {
    case "claim": {
      const claims =
        ref.owner === "pipeline"
          ? (network.pipelines.find((p) => p.id === ref.ownerId)?.claims ?? [])
          : (section(ref.ownerId)?.claims ?? [])
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
      const cited = section(ref.sectionId)?.claims.find(
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
        const candidate = found?.claims.find(
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

/** The question as it leaves Studio: the words, each thing by kind and id. */
export function buildQuestion({
  words,
  sections,
  refs,
  network,
  edition,
}: {
  words: string
  sections: readonly SectionsAttached[]
  refs: readonly AgentRef[]
  network: Network
  edition: Edition
}): Question {
  return {
    words: words.trim(),
    about: [
      ...sections.flatMap((s) => sectionItems(s, network)),
      ...refs.map((ref) => refItem(ref, network)),
    ],
    edition: { id: edition.id, year: edition.year },
    network: network.name,
  }
}

/** Every proposal waiting on one claim of a section, as references. */
export function proposalRefs(section: Section, attribute: string): AgentRef[] {
  const claim = section.claims.find((c) => c.attribute === attribute)
  return [
    ...(claim?.proposals ?? []).map((_, index): AgentRef => ({
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
} as const
