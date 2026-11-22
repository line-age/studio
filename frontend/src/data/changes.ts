import { claimsWith, ownDetail, type DetailLookup } from "./detail"
import {
  withClaims,
  type Claim,
  type Network,
  type Pipeline,
  type Section,
} from "./schema"
import { shortId } from "./short-id"
import { editsBundle, PIPELINE_KEYS } from "./store/write-edits"
import {
  decideMembershipsBundle,
  mergeBundles,
  placeBundle,
  postBundle,
  reviewClaim,
  reviewLink,
  type Target,
} from "./store/write"

/*
 * What a person changes in Studio, in one type. On the sample a change is
 * applied in memory (`applyChange`), so tests and the demo work; on store's
 * data it is sent (`sendChange`) and the network is read again. Nothing is
 * shown as done until store says so.
 */

/** A candidate claim on a section or a pipeline: which one, by its place. */
export interface ProposalAt {
  owner: "section" | "pipeline"
  ownerId: string
  attribute: string
  /** Which of the claim's proposals, by place: only for display. */
  index: number
  /**
   * The candidate claim's id, where the data has one. Store is told by it,
   * never by place, so a list that changed in between cannot decide the
   * wrong one.
   */
  id?: string
}

/** A typed value for one of a pipeline's own claims (Name, Owner, Operator). */
export interface PipelineEdit {
  attribute: string
  value: string
}

export type Change =
  /** Make a pipeline, add to one, move, remove: one change. */
  | { kind: "place"; sectionIds: readonly string[]; target: Target }
  /** A pipeline's sections: some added, some removed, in one save. */
  | {
      kind: "members"
      pipelineId: string
      add: readonly string[]
      remove: readonly string[]
    }
  /** A pipeline's own claims, as a person typed them, and why. */
  | {
      kind: "edit-pipeline"
      pipelineId: string
      edits: readonly PipelineEdit[]
      note: string
    }
  /** A proposed pipeline, decided whole. */
  | { kind: "decide-pipeline"; pipelineId: string; verdict: Verdict }
  /** A proposed end (`same_as`). A proposed cut is never decided here. */
  | { kind: "decide-end"; sectionId: string; endId: string; verdict: Verdict }
  | { kind: "decide-claim"; at: ProposalAt; verdict: Verdict }

export type Verdict = "confirm" | "reject"

/**
 * A proposed pipeline, as a whole decision: the memberships a confirm makes
 * (sections in no pipeline) and the sections it leaves where they are,
 * because they are already in another one (they keep their proposal).
 */
export interface PipelineDecision {
  pipeline: Pipeline
  /** Every section proposed into it, with the proposal. */
  proposed: {
    section: Section
    linkId: string
    score: number
    proposer?: string
  }[]
  /** The ones a confirm places: in no pipeline yet. */
  confirms: { section: Section; linkId: string }[]
  /** Already in another pipeline: a confirm leaves them there. */
  placed: Section[]
}

export function pipelineDecision(
  network: Network,
  pipelineId: string
): PipelineDecision | null {
  const pipeline = network.pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) return null
  const proposed = network.sections.flatMap((section) =>
    section.proposedMemberships
      .filter((m) => m.pipelineId === pipelineId)
      .map((m) => ({
        section,
        linkId: m.id,
        score: m.score,
        ...(m.proposer ? { proposer: m.proposer } : {}),
      }))
  )
  if (proposed.length === 0) return null
  return {
    pipeline,
    proposed,
    confirms: proposed
      .filter((p) => p.section.pipelineId === null)
      .map(({ section, linkId }) => ({ section, linkId })),
    placed: proposed
      .filter((p) => p.section.pipelineId !== null)
      .map((p) => p.section),
  }
}

/** Every proposed pipeline: a pipeline some section is proposed into. */
export function proposedPipelines(network: Network): PipelineDecision[] {
  const ids = new Set(
    network.sections.flatMap((s) =>
      s.proposedMemberships.map((m) => m.pipelineId)
    )
  )
  return [...ids].flatMap((id) => pipelineDecision(network, id) ?? [])
}

function claimAt(
  network: Network,
  at: ProposalAt,
  details: DetailLookup
): Claim | undefined {
  if (at.owner === "pipeline") {
    return network.pipelines
      .find((p) => p.id === at.ownerId)
      ?.claims.find((c) => c.attribute === at.attribute)
  }
  const section = network.sections.find((s) => s.id === at.ownerId)
  return section
    ? claimsWith(details, section).find((c) => c.attribute === at.attribute)
    : undefined
}

/** The id a new pipeline gets on the sample, from the action's key. */
export function newPipelineId(key: string): string {
  return `new-${key}`
}

/** Apply `change` to the sample, in memory. Pure. */
export function applyChange(
  network: Network,
  change: Change,
  key: string
): Network {
  switch (change.kind) {
    case "place": {
      const { target } = change
      const ids = new Set(change.sectionIds)
      const to =
        target.kind === "pipeline"
          ? target.pipelineId
          : target.kind === "new"
            ? newPipelineId(key)
            : null
      const name = target.kind === "new" ? target.name?.trim() : undefined
      const pipelines =
        target.kind === "new"
          ? [
              ...network.pipelines,
              {
                id: to!,
                code: shortId(to!),
                name: name || null,
                claims: name ? [personClaim("Name", name, "")] : [],
              },
            ]
          : network.pipelines
      return {
        ...network,
        pipelines,
        sections: network.sections.map((s) => {
          if (!ids.has(s.id)) return s
          const rest = { ...s }
          delete rest.membershipId
          return {
            ...rest,
            pipelineId: to,
            // A confirmed membership answers a proposal into the same pipeline.
            proposedMemberships: s.proposedMemberships.filter(
              (m) => m.pipelineId !== to
            ),
          }
        }),
      }
    }
    case "members": {
      const added = applyChange(
        network,
        {
          kind: "place",
          sectionIds: change.add,
          target: { kind: "pipeline", pipelineId: change.pipelineId },
        },
        key
      )
      return applyChange(
        added,
        { kind: "place", sectionIds: change.remove, target: { kind: "none" } },
        key
      )
    }
    case "edit-pipeline":
      return {
        ...network,
        pipelines: network.pipelines.map((p) => {
          if (p.id !== change.pipelineId) return p
          let claims = p.claims
          for (const edit of change.edits) {
            const claim = personClaim(edit.attribute, edit.value, change.note)
            const at = claims.findIndex((c) => c.attribute === edit.attribute)
            claims =
              at === -1
                ? [...claims, claim]
                : claims.map((c, i) => (i === at ? claim : c))
          }
          const name = change.edits.find((e) => e.attribute === "Name")
          return { ...p, claims, ...(name ? { name: name.value.trim() } : {}) }
        }),
      }
    case "decide-pipeline": {
      const decision = pipelineDecision(network, change.pipelineId)
      if (!decision) return network
      const confirms = new Set(decision.confirms.map((c) => c.section.id))
      return {
        ...network,
        sections: network.sections.map((s) => {
          const keeps =
            change.verdict === "confirm" && !confirms.has(s.id)
              ? s.proposedMemberships
              : s.proposedMemberships.filter(
                  (m) => m.pipelineId !== change.pipelineId
                )
          if (keeps === s.proposedMemberships) return s
          return {
            ...s,
            pipelineId:
              change.verdict === "confirm" && confirms.has(s.id)
                ? change.pipelineId
                : s.pipelineId,
            proposedMemberships: keeps,
          }
        }),
      }
    }
    case "decide-end":
      return {
        ...network,
        sections: network.sections.map((s) =>
          s.id === change.sectionId
            ? {
                ...s,
                proposedEnds: s.proposedEnds.filter(
                  (e) => e.id !== change.endId
                ),
              }
            : s
        ),
      }
    case "decide-claim": {
      const { at } = change
      const decide = (claims: Claim[]) =>
        claims.map((c) => {
          if (c.attribute !== at.attribute) return c
          const proposal = c.proposals[at.index]
          if (!proposal) return c
          const proposals = c.proposals.filter((_, i) => i !== at.index)
          if (change.verdict === "reject") return { ...c, proposals }
          return {
            ...c,
            value:
              c.value === null
                ? proposal.value
                : `${c.value}; ${proposal.value}`,
            citations: [...c.citations, proposal.citation],
            proposals,
          }
        })
      return at.owner === "section"
        ? {
            ...network,
            sections: network.sections.map((s) =>
              s.id === at.ownerId && s.claims
                ? withClaims(s, decide(s.claims))
                : s
            ),
          }
        : {
            ...network,
            pipelines: network.pipelines.map((p) =>
              p.id === at.ownerId ? { ...p, claims: decide(p.claims) } : p
            ),
          }
    }
  }
}

/** A person's typed value on the sample: cited to "Studio edit", like Edit. */
function personClaim(attribute: string, value: string, note: string): Claim {
  return {
    attribute,
    value: value.trim(),
    citations: [
      { source: "Studio edit", ...(note.trim() ? { quote: note.trim() } : {}) },
    ],
    proposals: [],
    madeAt: new Date().toISOString().slice(0, 10),
  }
}

/** A section as a write needs it: its id and its confirmed membership. */
function placedOf(network: Network, ids: readonly string[]) {
  const byId = new Map(network.sections.map((s) => [s.id, s]))
  const sections = ids.map((id) => {
    const s = byId.get(id)
    if (!s) throw new MissingIdError("section")
    return {
      id: s.id,
      pipelineId: s.pipelineId,
      ...(s.membershipId ? { membershipId: s.membershipId } : {}),
    }
  })
  if (sections.some((s) => s.pipelineId !== null && !s.membershipId))
    throw new MissingIdError("membership")
  return sections
}

/** A pipeline's typed values as a bundle part, on `feature` (an id or a ref). */
function pipelineEditsBundle(
  feature: string,
  edits: readonly PipelineEdit[],
  note: string
) {
  return editsBundle(
    edits.map((edit) => ({
      feature,
      key: PIPELINE_KEYS[edit.attribute],
      label: edit.attribute,
      value: edit.value,
    })),
    note
  )
}

/** A write needs ids from store; the sample has none for some things. */
export class MissingIdError extends Error {
  constructor(what: string) {
    super(`This ${what} has no id in store, so it cannot be changed here.`)
    this.name = "MissingIdError"
  }
}

/** Send `change` to store. */
export async function sendChange(
  network: Network,
  change: Change,
  key: string,
  /** Sections' details, for a candidate named by place and not by id. */
  details: DetailLookup = ownDetail
): Promise<void> {
  switch (change.kind) {
    case "place": {
      const sections = placedOf(network, change.sectionIds)
      const bundle = placeBundle(sections, change.target, key)
      const name =
        change.target.kind === "new" ? change.target.name?.trim() : undefined
      await postBundle(
        name
          ? mergeBundles(
              bundle,
              pipelineEditsBundle(
                "line",
                [{ attribute: "Name", value: name }],
                ""
              )
            )
          : bundle
      )
      return
    }
    case "members": {
      const target: Target = { kind: "pipeline", pipelineId: change.pipelineId }
      await postBundle(
        mergeBundles(
          placeBundle(placedOf(network, change.add), target, key),
          placeBundle(placedOf(network, change.remove), { kind: "none" }, key)
        )
      )
      return
    }
    case "edit-pipeline":
      if (change.edits.length === 0) return
      await postBundle(
        pipelineEditsBundle(change.pipelineId, change.edits, change.note)
      )
      return
    case "decide-pipeline": {
      const decision = pipelineDecision(network, change.pipelineId)
      if (!decision) return
      const linkIds =
        change.verdict === "confirm"
          ? decision.confirms.map((c) => c.linkId)
          : decision.proposed.map((p) => p.linkId)
      if (linkIds.length === 0) return
      await postBundle(decideMembershipsBundle(linkIds, change.verdict))
      return
    }
    case "decide-end":
      await reviewLink(change.endId, change.verdict)
      return
    case "decide-claim": {
      const id =
        change.at.id ??
        claimAt(network, change.at, details)?.proposals[change.at.index]?.id
      if (!id) throw new MissingIdError("claim")
      await reviewClaim(id, change.verdict === "confirm" ? "accept" : "reject")
      return
    }
  }
}
