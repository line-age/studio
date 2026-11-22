import { appliesTo, isTyped, readTyped, ruleFor } from "../edit-rules"
import { attributeStoreKey } from "./to-network"
import { claimIdsOf, postBundle, type Bundle, type BundleClaim } from "./write"

/*
 * Saving a person's Edit to store, as a bundle, through write.ts like every
 * other write. What can be written, and how typed text becomes a value, is
 * store's own registry (`../edit-rules.ts`): an attribute whose value is
 * typed (a diameter today; Status is chosen from store's words and Geometry
 * is a line, so neither is typed) and that applies to a section. First seen,
 * Last seen and Build date have no claim slot yet. See AGENTS.md.
 */

export interface SectionEdit {
  sectionId: string
  attribute: string
  value: string
}

const STUDIO_SOURCE_REF = "studio-edit-source"

/** A pipeline's own claims, as Studio names them, and store's key for each. */
export const PIPELINE_KEYS: Readonly<Record<string, string>> = {
  Name: "name",
  Owner: "owner",
  Operator: "operator",
}

/**
 * Why typed text cannot be a pipeline's Name, Owner or Operator, by the
 * rules, or undefined when it can. Empty is not a mistake: it changes nothing.
 */
export function pipelineTypedError(
  attribute: string,
  text: string
): string | undefined {
  const key = PIPELINE_KEYS[attribute]
  if (!key || text.trim() === "") return undefined
  const read = readTyped(key, text)
  return read.ok ? undefined : read.message
}

/** Whether Edit can write this attribute to store. */
export function writableOnStore(attribute: string): boolean {
  const key = attributeStoreKey(attribute)
  const rule = key ? ruleFor(key) : undefined
  return !!rule && isTyped(rule) && appliesTo(rule, { kind: "section" })
}

/** Only the edits Edit can write to store. */
export function persistableEdits(edits: readonly SectionEdit[]): SectionEdit[] {
  return edits.filter((edit) => writableOnStore(edit.attribute))
}

/**
 * Why typed text cannot be an attribute's value, by store's rules, or
 * undefined when it can (or when store keeps no claim for the attribute).
 */
export function typedError(
  attribute: string,
  text: string
): string | undefined {
  const key = attributeStoreKey(attribute)
  const rule = key ? ruleFor(key) : undefined
  if (!key || !rule || !isTyped(rule) || text.trim() === "") return undefined
  const read = readTyped(key, text)
  return read.ok ? undefined : read.message
}

/** One claim a person types, on any feature: store's key and the text. */
export interface FeatureEdit {
  /** A feature's id, or a ref to one made in the same bundle. */
  feature: string
  /** Store's attribute key. */
  key: string
  /** The attribute as Studio names it, for the words of a mistake. */
  label: string
  value: string
}

/**
 * The part of a bundle that writes a person's typed values: a shared "Studio
 * edit" source (idempotent: the same external key every time), one citation
 * per claim carrying the edit's note, and one claim per edit. A value the
 * rules refuse is an error, never skipped.
 */
export function editsBundle(
  edits: readonly FeatureEdit[],
  note: string
): Required<Pick<Bundle, "sources" | "citations" | "claims">> {
  const citations: NonNullable<Bundle["citations"]> = []
  const claims: BundleClaim[] = []

  edits.forEach((edit, index) => {
    const citationRef = `citation-${index}`
    citations.push({
      ref: citationRef,
      source: STUDIO_SOURCE_REF,
      ...(note.trim() ? { quote: note.trim() } : {}),
    })
    const base = {
      ref: `claim-${index}`,
      feature: edit.feature,
      attribute: edit.key,
      citations: [{ citation: citationRef, role: "confirms" }],
    }
    const read = readTyped(edit.key, edit.value)
    if (!read.ok) {
      throw new Error(
        `${edit.label} "${edit.value}": ${read.message} Nothing was changed.`
      )
    }
    claims.push({ ...base, ...read.value })
  })

  return {
    sources: [
      {
        ref: STUDIO_SOURCE_REF,
        kind: "dataset",
        title: "Studio edit",
        external_key: { system: "studio", key: STUDIO_SOURCE_REF },
      },
    ],
    citations,
    claims,
  }
}

/**
 * Writes the edits store can keep as one bundle (`editsBundle`). No `status`
 * is asked for: store decides candidate or accepted by who Studio's token
 * speaks for (see AGENTS.md on what that means today). Resolves with the
 * ids of the claims written, for an Undo that rejects them.
 */
export async function saveEditsToStore(
  edits: readonly SectionEdit[],
  note: string
): Promise<string[]> {
  const writable = persistableEdits(edits)
  if (writable.length === 0) return []
  const answer = await postBundle(
    editsBundle(
      writable.map((edit) => ({
        feature: edit.sectionId,
        key: attributeStoreKey(edit.attribute)!,
        label: edit.attribute,
        value: edit.value,
      })),
      note
    )
  )
  return claimIdsOf(answer)
}
