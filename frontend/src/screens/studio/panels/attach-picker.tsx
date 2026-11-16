import { useMemo } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  NO_PIPELINE_ID,
  pipelineLabel,
  plural,
  sectionLabel,
} from "@/data/derive"
import { useStudioData } from "../studio-data"
import { useStudio, type AgentAttachment } from "../studio-store"

interface Choice {
  key: string
  label: string
  meta: string
  attachment: AgentAttachment
}

/**
 * Picks a pipeline or a section to attach to the message being written: what
 * the composer's attach button and "#" open. A pick attaches it and closes.
 */
export function AttachPicker({ onClose }: { onClose: () => void }) {
  const { network } = useStudioData()
  const attach = useStudio((s) => s.attachToAgent)

  const choices = useMemo<Choice[]>(() => {
    const pipelines = network.pipelines.map((pipeline) => {
      const ids = network.sections
        .filter((s) => s.pipelineId === pipeline.id)
        .map((s) => s.id)
      return {
        key: `pipeline:${pipeline.id}`,
        label: pipelineLabel(pipeline),
        meta: `Pipeline, ${plural(ids.length, "section")}`,
        attachment: { pipelineId: pipeline.id, sectionIds: ids },
      }
    })
    const sections = network.sections.map((section) => ({
      key: `section:${section.id}`,
      label: sectionLabel(section),
      meta: "Section",
      attachment: {
        pipelineId: section.pipelineId ?? NO_PIPELINE_ID,
        sectionIds: [section.id],
      },
    }))
    return [...pipelines, ...sections]
  }, [network])

  return (
    <Combobox<Choice>
      items={choices}
      itemToStringLabel={(choice) => choice.label}
      defaultOpen
      autoHighlight
      limit={50}
      onValueChange={(choice) => {
        if (!choice) return
        attach([choice.attachment])
        onClose()
      }}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <ComboboxInput
        autoFocus
        showTrigger={false}
        aria-label="Find a section or pipeline to attach"
        placeholder="Find a section or pipeline"
      />
      <ComboboxContent>
        <ComboboxEmpty>Nothing goes by that name.</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.key} value={choice}>
              <span className="truncate type-ui-sm">{choice.label}</span>
              <span className="ml-auto shrink-0 type-ui-xs text-muted-foreground">
                {choice.meta}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
