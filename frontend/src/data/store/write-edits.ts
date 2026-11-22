import { appliesTo, isTyped, readTyped, ruleFor } from "../edit-rules"
import { attributeStoreKey } from "./to-network"
import { postBundle, type Bundle, type BundleClaim } from "./write"

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

/**
 * Writes the edits store can keep as one bundle: a shared "Studio edit"
 * source (idempotent: the same external key every time), one citation per
 * claim carrying the edit's note, and one claim per attribute per section.
 * No `status` is asked for: store decides candidate or accepted by who
 * Studio's token speaks for (see AGENTS.md on what that means today). A
 * value it cannot write is an error, never skipped: the person is told
 * nothing was saved rather than that it was.
 */
export async function saveEditsToStore(
  edits: readonly SectionEdit[],
  note: string
): Promise<void> {
  const writable = persistableEdits(edits)
  if (writable.length === 0) return

  const citations: NonNullable<Bundle["citations"]> = []
  const claims: BundleClaim[] = []

  writable.forEach((edit, index) => {
    const key = attributeStoreKey(edit.attribute)!
    const citationRef = `citation-${index}`
    citations.push({
      ref: citationRef,
      source: STUDIO_SOURCE_REF,
      ...(note.trim() ? { quote: note.trim() } : {}),
    })
    const base = {
      ref: `claim-${index}`,
      feature: edit.sectionId,
      attribute: key,
      citations: [{ citation: citationRef, role: "confirms" }],
    }
    const read = readTyped(key, edit.value)
    if (!read.ok) {
      throw new Error(
        `${edit.attribute} "${edit.value}": ${read.message} Nothing was changed.`
      )
    }
    claims.push({ ...base, ...read.value })
  })

  await postBundle({
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
  })
}
