import { actionKey } from "@/data/store/write"

import { useStudioData } from "./studio-data"
import { useStudio } from "./studio-store"

/** An item in the right-click menu that changes something, above the questions. */
export interface MenuChange {
  label: string
  onSelect: () => void
}

/**
 * What the right-click menu offers for changing pipelines (Figma `213:8451`
 * and `209:7993`), acting as the person using Studio. One section: Change
 * pipeline (move it, take it out, start a new one), in the dock. Several:
 * Make pipeline, at once, and Add to a pipeline, in the dock.
 */
export function usePipelineChanges(): (
  sectionIds: readonly string[]
) => MenuChange[] {
  const { change, network } = useStudioData()
  const editPipeline = useStudio((s) => s.editPipeline)
  return (sectionIds) => {
    if (sectionIds.length === 0) return []
    if (sectionIds.length === 1) {
      return [
        {
          label: "Change pipeline",
          onSelect: () => editPipeline({ mode: "change", sectionIds }),
        },
      ]
    }
    const make: MenuChange = {
      label: "Make pipeline",
      onSelect: () => {
        const key = actionKey()
        change(
          { kind: "place", sectionIds, target: { kind: "new" } },
          key
        ).then(
          () =>
            editPipeline({
              mode: "done",
              failed: false,
              text: `${sectionIds.length} sections are in a new pipeline now. It has no name until a source gives one.`,
            }),
          (e: unknown) =>
            editPipeline({
              mode: "done",
              failed: true,
              text: e instanceof Error ? e.message : String(e),
            })
        )
      },
    }
    return network.pipelines.length > 0
      ? [
          make,
          {
            label: "Add to a pipeline",
            onSelect: () => editPipeline({ mode: "add", sectionIds }),
          },
        ]
      : [make]
  }
}
