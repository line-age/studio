import { postBundle, type BundleRequest } from "./client"
import { attributeStoreKey } from "./to-network"

/*
 * Saving a person's Edit to store, as a bundle. Only the attributes store
 * actually has a claim slot for can be written this way: attributeStoreKey
 * says which. Every other edited attribute (First seen, Last seen, Build
 * date, Geometry today) stays local to Studio; see AGENTS.md.
 */

export interface SectionEdit {
  sectionId: string
  attribute: string
  value: string
}

const STUDIO_SOURCE_REF = "studio-edit-source"

/** Only the edits store has a real attribute_key for. */
export function persistableEdits(edits: readonly SectionEdit[]): SectionEdit[] {
  return edits.filter((edit) => attributeStoreKey(edit.attribute) !== null)
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

/**
 * Writes the edits store can keep as one bundle: a shared "Studio edit"
 * source (idempotent: the same external key every time), one citation per
 * claim carrying the edit's note, and one claim per attribute per section.
 * No `status` is asked for: store decides candidate or accepted by who
 * Studio's token speaks for (see AGENTS.md on what that means today).
 */
export async function saveEditsToStore(
  edits: readonly SectionEdit[],
  note: string
): Promise<void> {
  const writable = persistableEdits(edits)
  if (writable.length === 0) return

  const citations: NonNullable<BundleRequest["citations"]> = []
  const claims: NonNullable<BundleRequest["claims"]> = []

  writable.forEach((edit, index) => {
    const key = attributeStoreKey(edit.attribute)
    if (!key) return
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
    if (key === "diameter") {
      const parsed = parseQuantity(edit.value)
      if (!parsed) return
      claims.push({
        ...base,
        value_num: parsed.value,
        value_unit: parsed.unit,
      })
    } else {
      claims.push({ ...base, value_text: edit.value })
    }
  })

  if (claims.length === 0) return

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
