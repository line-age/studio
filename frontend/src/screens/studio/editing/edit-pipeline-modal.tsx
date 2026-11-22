import { useRef, useState } from "react"

import {
  EditModal,
  EditModalBody,
  EditModalField,
  EditModalFooter,
  EditModalHeader,
} from "@/components/edit-modal"
import { Input } from "@/components/ui/input"
import type { PipelineEdit } from "@/data/changes"
import { listWords, pipelineLabel, plural } from "@/data/derive"
import type { Pipeline } from "@/data/schema"
import { pipelineTypedError } from "@/data/store/write-edits"
import { actionKey } from "@/data/store/write"

import { useStudioData } from "../studio-data"
import { useSave } from "./use-save-change"

/*
 * Edit pipeline (Figma `471:17263`), from a pipeline row's menu: Name,
 * Owner, Operator, and why it changed. Each is a claim on the pipeline,
 * cited to the person's edit, checked by the same rules the Agent's
 * proposals are. A field left as it opened changes nothing; an empty one is
 * not a removal (store keeps every claim; a wrong one is rejected, which
 * Studio cannot do from here yet).
 */

const FIELDS = ["Name", "Owner", "Operator"] as const

/** What a field opens with: the pipeline's value for it, or nothing. */
function opening(pipeline: Pipeline, attribute: string): string {
  if (attribute === "Name") return pipeline.name ?? ""
  return (
    pipeline.claims.find((c) => c.attribute === attribute && c.value)?.value ??
    ""
  )
}

export function EditPipelineModal({
  pipeline,
  onClose,
}: {
  pipeline: Pipeline
  onClose: () => void
}) {
  const { network } = useStudioData()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const key = useRef(actionKey())
  const { save, saving, failure, clearFailure } = useSave(onClose)
  const current = (attribute: string) =>
    fields[attribute] ?? opening(pipeline, attribute)
  const changed = FIELDS.filter((attribute) => {
    const text = current(attribute).trim()
    return text !== "" && text !== opening(pipeline, attribute).trim()
  })
  const errors = new Map(
    FIELDS.flatMap((attribute) => {
      const error = pipelineTypedError(attribute, current(attribute))
      return error ? [[attribute, error] as const] : []
    })
  )
  const sections = network.sections.filter(
    (s) => s.pipelineId === pipeline.id
  ).length
  const edits: PipelineEdit[] = changed.map((attribute) => ({
    attribute,
    value: current(attribute).trim(),
  }))
  const summary =
    changed.length > 0 ? `Will update ${listWords([...changed])}` : undefined
  const set = (attribute: string, value: string) => {
    // A different value is a different change: never the lost one again.
    key.current = actionKey()
    clearFailure()
    setFields((prev) => ({ ...prev, [attribute]: value }))
  }
  return (
    <EditModal
      open
      onOpenChange={(open) => !open && !saving && onClose()}
      onSubmit={() => {
        if (changed.length === 0 || errors.size > 0) return
        void save(
          { kind: "edit-pipeline", pipelineId: pipeline.id, edits, note },
          key.current,
          `Updated ${listWords([...changed])} on ${
            edits.find((e) => e.attribute === "Name")?.value ??
            pipelineLabel(pipeline)
          }.`
        )
      }}
    >
      <EditModalHeader
        title="Edit pipeline"
        meta={`${pipeline.code} · ${plural(sections, "section")}`}
      />
      <EditModalBody>
        {FIELDS.map((attribute, index) => {
          const id = `edit-pipeline-${attribute}`
          const error = errors.get(attribute)
          return (
            <EditModalField
              key={attribute}
              id={id}
              label={attribute}
              error={error}
            >
              <Input
                id={id}
                value={current(attribute)}
                placeholder="Unknown"
                className="placeholder:italic"
                autoFocus={index === 0}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => set(attribute, event.target.value)}
              />
            </EditModalField>
          )
        })}
        <div className="border-t pt-4">
          <EditModalField id="edit-pipeline-note" label="Note">
            <Input
              id="edit-pipeline-note"
              value={note}
              placeholder="Why this changed (optional)"
              className="placeholder:italic"
              onChange={(event) => {
                key.current = actionKey()
                setNote(event.target.value)
              }}
            />
          </EditModalField>
        </div>
      </EditModalBody>
      <EditModalFooter
        summary={summary}
        action="Save"
        ready={changed.length > 0 && errors.size === 0}
        saving={saving}
        failure={failure}
      />
    </EditModal>
  )
}
