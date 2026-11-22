import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { EditSectionsDialog } from "./edit-sections-dialog"

/*
 * The one place the modals for changes are mounted (Figma section 20). A
 * menu item or a button opens one through the store's `edit`; closing it
 * sets `editing` back to null.
 */
export function EditingModals() {
  const editing = useStudio((s) => s.editing)
  const edit = useStudio((s) => s.edit)
  const { sectionById } = useStudioData()
  const close = (open: boolean) => {
    if (!open) edit(null)
  }
  const sections =
    editing?.kind === "edit-sections"
      ? editing.sectionIds.flatMap((id) => sectionById.get(id) ?? [])
      : []
  return (
    <EditSectionsDialog
      open={sections.length > 0}
      onOpenChange={close}
      sections={sections}
    />
  )
}
