import { useEffect } from "react"

import { TopbarButton } from "@/components/topbar-button"
import { Button } from "@/components/ui/button"
import { pipelineLabel } from "@/data/derive"

import { useStudioData } from "../studio-data"
import { useStudio, type SectionsDraft } from "../studio-store"

/**
 * Pick on the map (Figma `475:17477`): the Sections modal folded into a bar
 * at the top of the map. A click on a section adds it or takes it off; Done
 * opens the modal again with the picks listed; Cancel (or Esc) drops only
 * the picks.
 */
export function PickBar({
  pipeline,
  picked,
  onCancel,
  onDone,
}: {
  /** The pipeline being added to, by its name or code. */
  pipeline: string
  /** How many sections the clicks changed: added, or marked for removal. */
  picked: number
  onCancel: () => void
  onDone: () => void
}) {
  return (
    <div
      role="group"
      aria-label={`Adding to ${pipeline}`}
      className="absolute top-3 left-1/2 flex max-w-[calc(100%-9rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-topbar py-1.5 pr-1.5 pl-3 whitespace-nowrap text-topbar-foreground shadow-map-control"
    >
      <span className="type-ui-sm-medium">Adding to {pipeline}</span>
      <span role="status" className="truncate type-ui-xs opacity-80">
        {picked} picked ·{" "}
        {picked === 0
          ? `click a section to add it, or one of ${pipeline}'s to remove it`
          : "click a section to add or take it off"}
      </span>
      <TopbarButton onClick={onCancel}>Cancel</TopbarButton>
      <Button size="sm" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}

/** The bar for the Sections modal being picked into, if any. Esc is Cancel. */
export function PickingBar() {
  const editing = useStudio((s) => s.editing)
  return editing?.kind === "sections" && editing.picking ? (
    <PickingBarShown draft={editing} />
  ) : null
}

function PickingBarShown({ draft }: { draft: SectionsDraft }) {
  const stopPicking = useStudio((s) => s.stopPicking)
  const { network } = useStudioData()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopPicking(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [stopPicking])
  const pipeline = network.pipelines.find((p) => p.id === draft.pipelineId)
  const before = new Set([
    ...(draft.picking?.add ?? []),
    ...(draft.picking?.remove ?? []),
  ])
  const picked = [...draft.add, ...draft.remove].filter(
    (id) => !before.has(id)
  ).length
  return (
    <PickBar
      pipeline={pipeline ? pipelineLabel(pipeline) : "the pipeline"}
      picked={picked}
      onCancel={() => stopPicking(false)}
      onDone={() => stopPicking(true)}
    />
  )
}
