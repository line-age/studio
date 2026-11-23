import type { Change } from "../changes"
import { pipelineLabel, sectionLabel, type SectionEdit } from "../derive"
import type { Network } from "../schema"
import { ATTRIBUTE_LABEL, type ChangeOffer } from "./answer"

/*
 * A change the Agent offered as a card, made by Studio as the person: the
 * same writes as the right-click menu and the modals (plan 2026-11-23-001,
 * D1), so Approve leaves the data as the menu path would. Pure: what to write,
 * whether what the card showed is still true (D3), and the words for it.
 */

/** What Approve writes: one of Studio's changes, or a typed value on sections. */
export type OfferWrite =
  | { kind: "change"; change: Change }
  | {
      kind: "section-edits"
      sectionIds: readonly string[]
      edits: readonly SectionEdit[]
    }

/** The write for `offer`, through the paths the menu and the modals use. */
export function writeFor(offer: ChangeOffer): OfferWrite {
  const sectionIds = offer.section_ids
  switch (offer.kind) {
    case "add":
    case "move":
      return {
        kind: "change",
        change: {
          kind: "place",
          sectionIds,
          target: { kind: "pipeline", pipelineId: offer.pipeline_id! },
        },
      }
    case "remove":
      return {
        kind: "change",
        change: { kind: "place", sectionIds, target: { kind: "none" } },
      }
    case "make":
      return {
        kind: "change",
        change: {
          kind: "place",
          sectionIds,
          target: offer.name
            ? { kind: "new", name: offer.name }
            : { kind: "new" },
        },
      }
    case "rename":
      return {
        kind: "change",
        change: {
          kind: "edit-pipeline",
          pipelineId: offer.pipeline_id!,
          edits: [{ attribute: "Name", value: offer.name ?? "" }],
          note: "",
        },
      }
    case "edit": {
      const attribute = labelOf(offer.attribute)
      const value = offer.value ?? ""
      if (sectionIds.length > 0)
        return {
          kind: "section-edits",
          sectionIds,
          edits: [{ attribute, value }],
        }
      return {
        kind: "change",
        change: {
          kind: "edit-pipeline",
          pipelineId: offer.pipeline_id!,
          edits: [{ attribute, value }],
          note: "",
        },
      }
    }
  }
}

/** Store's attribute key as Studio names it: diameter is Diameter. */
export function labelOf(attribute: string | null | undefined): string {
  const key = attribute ?? ""
  return ATTRIBUTE_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

/**
 * Why what the card showed is no longer true, in plain words, or null. Read
 * against the network as it is now, just before the write: a section that
 * moved or went, or a pipeline that went, makes the card out of date and
 * nothing is sent.
 */
export function staleness(offer: ChangeOffer, network: Network): string | null {
  const pipelines = new Map(network.pipelines.map((p) => [p.id, p]))
  const sections = new Map(network.sections.map((s) => [s.id, s]))
  for (const basis of offer.basis) {
    const section = sections.get(basis.section_id)
    if (!section) return "A section on the card is no longer there."
    const then = basis.pipeline_id ?? null
    if (section.pipelineId === then) continue
    const name = sectionLabel(section)
    const now = section.pipelineId ? pipelines.get(section.pipelineId) : null
    return now
      ? `${name} was moved to ${pipelineLabel(now)} after this was offered.`
      : `${name} was taken out of its pipeline after this was offered.`
  }
  if (offer.pipeline_id && !pipelines.has(offer.pipeline_id))
    return "The pipeline on the card is no longer there."
  return null
}

function count(n: number, one: string): string {
  return n === 1 ? one : `${n} sections`
}

/** A sentence ends once: "Elm Gas Co." takes no second full stop. */
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`
}

/** What the card says once it is made: "4 sections are in Tolland lateral." */
export function doneWords(offer: ChangeOffer, network: Network): string {
  const pipeline = network.pipelines.find((p) => p.id === offer.pipeline_id)
  const name = pipeline ? pipelineLabel(pipeline) : "the pipeline"
  const first = network.sections.find((s) => s.id === offer.section_ids[0])
  const n = offer.section_ids.length
  const these = count(n, first ? sectionLabel(first) : "1 section")
  const verb = n === 1 ? "is" : "are"
  switch (offer.kind) {
    case "add":
    case "move":
      return `${these} ${verb} in ${name}.`
    case "remove":
      return `${these} ${verb} in no pipeline.`
    case "make":
      return offer.name
        ? `${offer.name} holds ${count(n, "1 section")}.`
        : `A new pipeline holds ${count(n, "1 section")}.`
    case "rename":
      return sentence(`The pipeline is named ${offer.name}`)
    case "edit":
      return n > 0
        ? `${labelOf(offer.attribute)} is ${offer.value} on ${these}.`
        : sentence(`${labelOf(offer.attribute)} of ${name} is ${offer.value}`)
  }
}

/** "By you, 23 Nov 2026, 14:02.": who made it and when, as the card keeps it. */
export function byYou(at: Date): string {
  const day = at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const time = at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `By you, ${day}, ${time}.`
}
