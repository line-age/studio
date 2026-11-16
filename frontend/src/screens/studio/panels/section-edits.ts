import { applySectionEdits, listWords, type SectionEdit } from "@/data/derive"
import { dataSource } from "@/data/load-network"
import type { Network } from "@/data/schema"
import { attributeStoreKey } from "@/data/store/to-network"
import { saveEditsToStore } from "@/data/store/write-edits"

import { useUpdateNetwork } from "../studio-data"

export type { SectionEdit }

/**
 * Saves an Edit: on store data, writes the edits store can keep first, then
 * only on success applies the edit to what is on screen; on fixture data
 * (no store to write to) the edit is kept in this browser only, as before.
 * Either way, a person's edit always overrides what was there (team
 * decision, 2026-11-15); the returned function undoes it. Store has no way
 * to clear a claim it holds, so clearing an attribute store keeps is
 * refused rather than silently kept local only.
 */
export function useSaveSectionEdits(): (
  sectionIds: readonly string[],
  edits: readonly SectionEdit[],
  note: string
) => Promise<() => void> {
  const updateNetwork = useUpdateNetwork()
  return async (sectionIds, edits, note) => {
    if (dataSource() === "store") {
      const cleared = edits.filter(
        (edit) => edit.value === null && attributeStoreKey(edit.attribute) !== null
      )
      if (cleared.length > 0) {
        throw new Error(
          `Studio cannot clear ${listWords(cleared.map((edit) => edit.attribute))} on the store yet.`
        )
      }
      await saveEditsToStore(
        edits
          .filter(
            (edit): edit is SectionEdit & { value: string } =>
              edit.value !== null
          )
          .flatMap((edit) =>
            sectionIds.map((sectionId) => ({
              sectionId,
              attribute: edit.attribute,
              value: edit.value,
            }))
          ),
        note
      )
    }
    let previous: Network | undefined
    updateNetwork((network) => {
      previous = network
      return applySectionEdits(network, sectionIds, edits, note)
    })
    return () => {
      if (previous) updateNetwork(() => previous!)
    }
  }
}
