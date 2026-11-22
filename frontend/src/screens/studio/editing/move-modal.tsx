import { useMemo, useRef, useState, type ReactNode } from "react"

import {
  EditModal,
  EditModalBody,
  EditModalFooter,
  EditModalHeader,
} from "@/components/edit-modal"
import { Hint } from "@/components/hint"
import { StatusLabel } from "@/components/status-label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { pipelineLabel, plural, sectionLabel } from "@/data/derive"
import type { Section } from "@/data/schema"
import { actionKey, type Target } from "@/data/store/write"
import { cn } from "@/lib/utils"

import { useStudioData } from "../studio-data"
import { useSave } from "./use-save-change"

/*
 * Add to a pipeline, or move (Figma `471:17342`): from a section's menu or
 * several selected. Find the pipeline by name or code; nothing is chosen
 * when it opens, so one press cannot move a section. Remove from a pipeline
 * opens it set on Not in a pipeline (E2, `472:17474`). New pipelines come
 * from Make pipeline, never from here.
 */

const NONE = "none"

export function MoveModal({
  sections,
  removing = false,
  onClose,
}: {
  sections: Section[]
  /** Opened by Remove from <pipeline>: Not in a pipeline is chosen. */
  removing?: boolean
  onClose: () => void
}) {
  const { network } = useStudioData()
  const [query, setQuery] = useState("")
  const [choice, setChoice] = useState<string | null>(removing ? NONE : null)
  // One key per choice, so a retry makes nothing twice and another choice
  // is a new change, never the last one again.
  const key = useRef(actionKey())
  const { save, saving, failure, clearFailure } = useSave(onClose)

  const placed = sections.some((s) => s.pipelineId !== null)
  const allIn = sections.every((s) => s.pipelineId === sections[0].pipelineId)
    ? sections[0].pipelineId
    : null
  const counts = useMemo(() => {
    const byPipeline = new Map<string, number>()
    for (const s of network.sections) {
      if (s.pipelineId)
        byPipeline.set(s.pipelineId, (byPipeline.get(s.pipelineId) ?? 0) + 1)
    }
    return byPipeline
  }, [network])
  const words = query.trim().toLowerCase()
  const pipelines = network.pipelines.filter(
    (p) =>
      p.id !== allIn &&
      (!words ||
        pipelineLabel(p).toLowerCase().includes(words) ||
        p.code.toLowerCase().includes(words))
  )
  const chosen = network.pipelines.find((p) => p.id === choice)
  const target: Target | null =
    choice === null
      ? null
      : choice === NONE
        ? { kind: "none" }
        : { kind: "pipeline", pipelineId: choice }

  const verb = placed ? "Move" : "Add"
  const count = plural(sections.length, "section")
  const title =
    sections.length === 1
      ? `${verb} ${sectionLabel(sections[0])}`
      : `${verb} ${count}`
  const meta = sections.map((s) => s.code).join(", ")
  const leaving = sections.filter(
    (s) => s.pipelineId !== null && s.pipelineId !== choice
  )
  const from = (s: Section) =>
    pipelineLabel(network.pipelines.find((p) => p.id === s.pipelineId)!)
  const leavingWords =
    choice === NONE || leaving.length === 0
      ? null
      : sections.length === 1
        ? `It is in ${from(leaving[0])} and will leave it.`
        : `${leaving.length} of these ${leaving.length === 1 ? "is" : "are"} in ${
            new Set(leaving.map(from)).size === 1
              ? from(leaving[0])
              : "other pipelines"
          } and will leave ${leaving.length === 1 ? "it" : "them"}.`
  const summary =
    target === null
      ? undefined
      : target.kind === "none"
        ? `Will take ${count} out of ${
            allIn
              ? pipelineLabel(network.pipelines.find((p) => p.id === allIn)!)
              : "their pipelines"
          }`
        : `Will ${verb.toLowerCase()} ${count} to ${pipelineLabel(chosen!)}`
  const action =
    target?.kind === "none"
      ? sections.length === 1
        ? "Remove from pipeline"
        : `Remove ${count}`
      : `${verb} ${count}`

  return (
    <EditModal
      open
      onOpenChange={(open) => !open && !saving && onClose()}
      onSubmit={() => {
        if (target === null) return
        void save(
          { kind: "place", sectionIds: sections.map((s) => s.id), target },
          key.current,
          savedText(
            sections.length,
            target.kind === "none" ? null : pipelineLabel(chosen!)
          )
        )
      }}
    >
      <EditModalHeader title={title} meta={meta} />
      <EditModalBody>
        <div className="flex flex-col gap-2">
          <span id="move-to" className="type-ui-xs text-muted-foreground">
            {verb} to
          </span>
          {network.pipelines.length === 0 && !placed ? (
            <Hint>There is no pipeline yet. Make one with Make pipeline.</Hint>
          ) : (
            <>
              <Input
                aria-label="Find a pipeline"
                placeholder="Find a pipeline"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <RadioGroup
                aria-labelledby="move-to"
                value={choice}
                onValueChange={(value) => {
                  const next = value as string
                  if (next !== choice) key.current = actionKey()
                  setChoice(next)
                  clearFailure()
                }}
                className="max-h-[360px] gap-0 overflow-y-auto rounded-md border"
              >
                {pipelines.map((p) => (
                  <ChoiceRow
                    key={p.id}
                    value={p.id}
                    // A pipeline no source names yet reads Unknown, as in the list.
                    label={
                      p.name === null ? (
                        <>
                          <StatusLabel status="unknown" size="sm">
                            Unknown name
                          </StatusLabel>{" "}
                          · {p.code}
                        </>
                      ) : (
                        `${p.name} · ${p.code}`
                      )
                    }
                    name={`${p.name ?? "Unknown name"} · ${p.code}`}
                    meta={plural(counts.get(p.id) ?? 0, "section")}
                  />
                ))}
                {pipelines.length === 0 && (
                  <Hint className="px-3 py-2">No pipeline matches.</Hint>
                )}
                {placed && (
                  <ChoiceRow
                    value={NONE}
                    label="Not in a pipeline"
                    name="Not in a pipeline"
                  />
                )}
              </RadioGroup>
            </>
          )}
          <Hint className="type-ui-xs">
            {leavingWords ? `${leavingWords} ` : ""}A section is in one pipeline
            at a time.
          </Hint>
        </div>
      </EditModalBody>
      <EditModalFooter
        summary={summary}
        action={action}
        ready={target !== null}
        saving={saving}
        failure={failure}
      />
    </EditModal>
  )
}

/** What the toast says once it is saved. */
function savedText(count: number, to: string | null): string {
  const what = count === 1 ? "The section" : `${count} sections`
  const is = count === 1 ? "is" : "are"
  return to === null
    ? `${what} ${is} in no pipeline now.`
    : `${what} ${is} in ${to} now.`
}

function ChoiceRow({
  value,
  label,
  name,
  meta,
}: {
  value: string
  label: ReactNode
  /** The row's name for a screen reader. */
  name: string
  meta?: string
}) {
  const id = `move-choice-${value}`
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted"
      )}
    >
      <RadioGroupItem id={id} value={value} aria-label={name} />
      <span className="min-w-0 flex-1 truncate type-ui-sm">{label}</span>
      {meta && (
        <span className="shrink-0 type-ui-xs text-muted-foreground">
          {meta}
        </span>
      )}
    </label>
  )
}
