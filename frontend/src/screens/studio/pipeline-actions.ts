import { pipelineLabel } from "@/data/derive"

import { useStudioData } from "./studio-data"
import { useStudio } from "./studio-store"

/** An item in the right-click menu that changes something, above the questions. */
export interface MenuChange {
  label: string
  onSelect: () => void
}

/**
 * What the right-click menu offers for changing sections' pipelines (Figma
 * section 20, `472:17474` and `472:17496`), the same in the list and on the
 * map; each opens a modal. One section in a pipeline: Move to a pipeline,
 * Remove from <pipeline>. One in none: Add to a pipeline, Make pipeline.
 * Several: Make pipeline, Add to a pipeline. Items carry no dots.
 */
export function useSectionChanges(): (
  sectionIds: readonly string[]
) => MenuChange[] {
  const { network, sectionById } = useStudioData()
  const edit = useStudio((s) => s.edit)
  return (sectionIds) => {
    if (sectionIds.length === 0) return []
    const ids = [...sectionIds]
    const add: MenuChange[] =
      network.pipelines.length > 0
        ? [
            {
              label: "Add to a pipeline",
              onSelect: () => edit({ kind: "move", sectionIds: ids }),
            },
          ]
        : []
    const make: MenuChange = {
      label: "Make pipeline",
      onSelect: () => edit({ kind: "make", sectionIds: ids }),
    }
    const only = ids.length === 1 ? sectionById.get(ids[0]) : undefined
    const from = only?.pipelineId
      ? network.pipelines.find((p) => p.id === only.pipelineId)
      : undefined
    if (from) {
      return [
        {
          label: "Move to a pipeline",
          onSelect: () => edit({ kind: "move", sectionIds: ids }),
        },
        {
          label: `Remove from ${pipelineLabel(from)}`,
          onSelect: () =>
            edit({ kind: "move", sectionIds: ids, removing: true }),
        },
      ]
    }
    return ids.length === 1 ? [...add, make] : [make, ...add]
  }
}

/**
 * A pipeline row's menu (Figma `472:17456`): Edit pipeline and Sections. A
 * pipeline is edited, never made again: no Make pipeline here.
 */
export function usePipelineRowChanges(): (pipelineId: string) => MenuChange[] {
  const edit = useStudio((s) => s.edit)
  return (pipelineId) => [
    {
      label: "Edit pipeline",
      onSelect: () => edit({ kind: "edit-pipeline", pipelineId }),
    },
    {
      label: "Sections",
      onSelect: () =>
        edit({
          kind: "sections",
          pipelineId,
          add: [],
          remove: [],
          picking: null,
        }),
    },
  ]
}
