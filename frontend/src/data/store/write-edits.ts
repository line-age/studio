import { attributeStoreKey } from "./to-network"
import { postBundle, type Bundle, type BundleClaim } from "./write"

/*
 * Saving a person's Edit to store, as a bundle, through write.ts like every
 * other write. Only what a person can type and store can take is written
 * this way: a diameter. Status needs one of store's own words and Geometry a
 * line, so neither is typed; First seen, Last seen and Build date have no
 * claim slot yet. See AGENTS.md.
 */

export interface SectionEdit {
  sectionId: string
  attribute: string
  value: string
}

const STUDIO_SOURCE_REF = "studio-edit-source"

/** Store keys whose value Studio can make from what a person types. */
const TYPED_KEYS = new Set(["diameter"])

/** Whether Edit can write this attribute to store. */
export function writableOnStore(attribute: string): boolean {
  const key = attributeStoreKey(attribute)
  return key !== null && TYPED_KEYS.has(key)
}

/** Only the edits Edit can write to store. */
export function persistableEdits(edits: readonly SectionEdit[]): SectionEdit[] {
  return edits.filter((edit) => writableOnStore(edit.attribute))
}

/** "12 in" -> {value: 12, unit: "in"}. Whatever store expects for a quantity. */
export function parseQuantity(
  text: string
): { value: number; unit: string | null } | null {
  const match = /^\s*(-?[\d.]+)\s*(.*?)\s*$/.exec(text)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return { value, unit: match[2] || null }
}

/** Why a typed diameter cannot be written, or undefined when it can. */
export function diameterError(text: string): string | undefined {
  return text.trim() === "" || parseQuantity(text)
    ? undefined
    : "Give a number, like 12 in."
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
    const parsed = parseQuantity(edit.value)
    if (!parsed) {
      throw new Error(
        `${edit.attribute} "${edit.value}" is not a number. Nothing was changed.`
      )
    }
    claims.push({ ...base, value_num: parsed.value, value_unit: parsed.unit })
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
