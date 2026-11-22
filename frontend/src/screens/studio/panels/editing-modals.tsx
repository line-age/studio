import { EditPipelineModal } from "../editing/edit-pipeline-modal"
import { MakePipelineModal } from "../editing/make-pipeline-modal"
import { MoveModal } from "../editing/move-modal"
import { SectionsModal } from "../editing/sections-modal"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { EditSectionsDialog } from "./edit-sections-dialog"

/*
 * The one place the modals for changes are mounted (Figma section 20). A
 * menu item or a button opens one through the store's `edit`; closing it
 * sets `editing` back to null. While a pipeline's sections are picked on the
 * map, its modal is folded away and the bar on the map stands for it.
 */
export function EditingModals() {
  const editing = useStudio((s) => s.editing)
  const edit = useStudio((s) => s.edit)
  const { sectionById, network } = useStudioData()
  const close = () => edit(null)
  const sectionsOf = (ids: readonly string[]) =>
    ids.flatMap((id) => sectionById.get(id) ?? [])
  const pipelineOf = (id: string) => network.pipelines.find((p) => p.id === id)

  if (editing?.kind === "move") {
    const sections = sectionsOf(editing.sectionIds)
    return sections.length > 0 ? (
      <MoveModal
        key={editing.sectionIds.join(",") + String(editing.removing)}
        sections={sections}
        removing={editing.removing}
        onClose={close}
      />
    ) : null
  }
  if (editing?.kind === "make") {
    const sections = sectionsOf(editing.sectionIds)
    return sections.length > 0 ? (
      <MakePipelineModal
        key={editing.sectionIds.join(",")}
        sections={sections}
        onClose={close}
      />
    ) : null
  }
  if (editing?.kind === "edit-pipeline") {
    const pipeline = pipelineOf(editing.pipelineId)
    return pipeline ? (
      <EditPipelineModal
        key={pipeline.id}
        pipeline={pipeline}
        onClose={close}
      />
    ) : null
  }
  if (editing?.kind === "sections") {
    const pipeline = pipelineOf(editing.pipelineId)
    return pipeline && !editing.picking ? (
      <SectionsModal pipeline={pipeline} draft={editing} onClose={close} />
    ) : null
  }
  const sections =
    editing?.kind === "edit-sections" ? sectionsOf(editing.sectionIds) : []
  return (
    <EditSectionsDialog
      open={sections.length > 0}
      onOpenChange={(open) => !open && close()}
      sections={sections}
    />
  )
}
