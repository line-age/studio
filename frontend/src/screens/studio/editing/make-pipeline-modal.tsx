import { useRef, useState } from "react"

import {
  EditModal,
  EditModalBody,
  EditModalField,
  EditModalFooter,
  EditModalHeader,
} from "@/components/edit-modal"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { listWords, pipelineLabel, plural } from "@/data/derive"
import type { Section } from "@/data/schema"
import { pipelineTypedError } from "@/data/store/write-edits"
import { actionKey } from "@/data/store/write"

import { useStudioData } from "../studio-data"
import { useSave } from "./use-save-change"

/*
 * Make pipeline (Figma `471:17383`), from several sections selected. The
 * name is optional: with none the pipeline reads Unknown until a source
 * gives one. One bundle: the line, its sections and the name if given.
 */
export function MakePipelineModal({
  sections,
  onClose,
}: {
  sections: Section[]
  onClose: () => void
}) {
  const { network } = useStudioData()
  const [name, setName] = useState("")
  const key = useRef(actionKey())
  const { save, saving, failure } = useSave(onClose)
  const count = plural(sections.length, "section")
  const error = pipelineTypedError("Name", name)
  const leaving = sections.filter((s) => s.pipelineId !== null)
  const leavingWords = leaving.map((s) => {
    const from = network.pipelines.find((p) => p.id === s.pipelineId)
    return `${s.code} is in ${from ? pipelineLabel(from) : "a pipeline"} and will leave it.`
  })
  const given = name.trim()
  return (
    <EditModal
      open
      onOpenChange={(open) => !open && !saving && onClose()}
      onSubmit={() => {
        if (error) return
        void save(
          {
            kind: "place",
            sectionIds: sections.map((s) => s.id),
            target: { kind: "new", ...(given ? { name: given } : {}) },
          },
          key.current,
          given
            ? `Made ${given}, a pipeline of ${count}.`
            : `Made a pipeline of ${count}. Its name is Unknown until a source gives one.`
        )
      }}
    >
      <EditModalHeader title="Make pipeline" meta={count} />
      <EditModalBody>
        <EditModalField
          id="make-name"
          label="Name"
          error={error}
          hint="Leave empty when no source names it yet."
        >
          <Input
            id="make-name"
            value={name}
            placeholder="Optional"
            className="placeholder:italic"
            autoFocus
            aria-invalid={!!error}
            onChange={(event) => {
              key.current = actionKey()
              setName(event.target.value)
            }}
          />
        </EditModalField>
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <span className="w-24 shrink-0 pt-0.5 type-ui-xs text-muted-foreground">
              Sections
            </span>
            <ul
              aria-label="Sections"
              className="flex max-h-24 min-w-0 flex-1 flex-wrap gap-1.5 overflow-y-auto"
            >
              {sections.map((s) => (
                <li key={s.id}>
                  <Badge variant="secondary" title={s.name ?? undefined}>
                    {s.code}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
          {leavingWords.length > 0 && (
            <p className="pl-[7.5rem] type-ui-xs text-muted-foreground">
              {leavingWords.length <= 2
                ? leavingWords.join(" ")
                : `${listWords(leaving.map((s) => s.code))} are in other pipelines and will leave them.`}
            </p>
          )}
        </div>
      </EditModalBody>
      <EditModalFooter
        summary={`Will make a pipeline of ${count}${given ? ` named ${given}` : ""}`}
        action="Make pipeline"
        ready={!error}
        saving={saving}
        failure={failure}
      />
    </EditModal>
  )
}
