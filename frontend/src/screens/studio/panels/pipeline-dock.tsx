import { useRef, useState } from "react"

import { Icon } from "@/components/icons/icon"
import { PanelHeader } from "@/components/panel-header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pipelineLabel } from "@/data/derive"
import type { Target } from "@/data/store/write"
import { actionKey } from "@/data/store/write"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/*
 * Where sections go, docked at the bottom of the right panel (Figma
 * `209:8268`): Change pipeline for one section (move it, take it out or
 * start a new pipeline from it) and Add to a pipeline for several. It acts
 * as the person using Studio, once they press Change; nothing is shown as
 * done until store says so. Also says what a change came to, or why store
 * refused it.
 */

const NONE = "none"
const NEW = "new"

export function PipelineDock() {
  const edit = useStudio((s) => s.pipelineEdit)
  const close = () => useStudio.getState().editPipeline(null)
  if (edit === null) return null
  if (edit.mode === "done") {
    return (
      <section
        aria-label="Pipeline change"
        className="flex shrink-0 flex-col border-t bg-background"
      >
        <PanelHeader title="Pipeline change">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={close}
          >
            <Icon name="close" className="size-3.5" />
          </Button>
        </PanelHeader>
        <p
          role={edit.failed ? "alert" : "status"}
          className="px-3 pb-3 type-ui-sm"
        >
          {edit.text}
        </p>
      </section>
    )
  }
  return (
    <Chooser
      key={edit.sectionIds.join(",") + edit.mode}
      mode={edit.mode}
      sectionIds={edit.sectionIds}
    />
  )
}

function Chooser({
  mode,
  sectionIds,
}: {
  mode: "change" | "add"
  sectionIds: readonly string[]
}) {
  const { network, sectionById, change } = useStudioData()
  const editPipeline = useStudio((s) => s.editPipeline)
  const sections = sectionIds.flatMap((id) => sectionById.get(id) ?? [])
  const first = sections[0]
  const from =
    mode === "change" && first?.pipelineId
      ? network.pipelines.find((p) => p.id === first.pipelineId)
      : undefined
  const pipelines = network.pipelines
    .filter((p) => p.id !== from?.id)
    .map((p) => ({ value: p.id, label: `${pipelineLabel(p)} · ${p.code}` }))
  const items = [
    ...pipelines,
    ...(mode === "change"
      ? [
          ...(from ? [{ value: NONE, label: "Not in a pipeline" }] : []),
          { value: NEW, label: "New pipeline" },
        ]
      : []),
  ]
  // Nothing is chosen until the person chooses: a default would move or take
  // out a section on one press of Change.
  const [choice, setChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per choice made, so a retry after a lost answer makes nothing
  // twice, and a different choice is a new change, never the last one again.
  const key = useRef(actionKey())
  if (!first) return null

  const target: Target | null =
    choice === null
      ? null
      : choice === NONE
        ? { kind: "none" }
        : choice === NEW
          ? { kind: "new" }
          : { kind: "pipeline", pipelineId: choice }
  const chosen = items.find((item) => item.value === choice)
  const title = mode === "change" ? "Change pipeline" : "Add to a pipeline"
  const meta =
    sections.length === 1
      ? [first.name, first.code].filter(Boolean).join(" · ")
      : `${sections.length} sections`
  const placed = sections.filter(
    (s) => s.pipelineId !== null && s.pipelineId !== choice
  ).length

  const submit = async () => {
    if (target === null) return
    setBusy(true)
    setError(null)
    try {
      await change({ kind: "place", sectionIds, target }, key.current)
      editPipeline({
        mode: "done",
        failed: false,
        text: doneText(sections.length, target, chosen?.label),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <section
      aria-label={title}
      className="flex shrink-0 flex-col border-t bg-background"
    >
      <PanelHeader title={title} meta={meta}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Close ${title}`}
          onClick={() => editPipeline(null)}
        >
          <Icon name="close" className="size-3.5" />
        </Button>
      </PanelHeader>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {items.length === 0 ? (
          <p className="type-ui-sm">
            There is no pipeline yet. Make one with Make pipeline.
          </p>
        ) : (
          <>
            <label
              className="type-ui-xs text-muted-foreground"
              htmlFor="pipeline-dock-choice"
            >
              {mode === "change" ? "Move to" : "Add to"}
            </label>
            <Select
              items={items}
              value={choice}
              onValueChange={(value) => {
                if (value !== choice) key.current = actionKey()
                setChoice(value as string | null)
              }}
            >
              <SelectTrigger id="pipeline-dock-choice" className="w-full">
                <SelectValue placeholder="Choose where it goes" />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className="w-(--anchor-width)"
              >
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="type-ui-xs text-muted-foreground">
              {mode === "change"
                ? from
                  ? `It leaves ${pipelineLabel(from)}. Choose Not in a pipeline to take it out, or New pipeline to start one. A section is in one pipeline at a time.`
                  : "It is in no pipeline. Choose one to put it in, or New pipeline to start one. A section is in one pipeline at a time."
                : placed > 0
                  ? `${placed} of these ${placed === 1 ? "is" : "are"} in another pipeline and will leave it. A section is in one pipeline at a time.`
                  : "A section is in one pipeline at a time."}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="type-ui-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || target === null}
            onClick={() => void submit()}
          >
            {busy ? "Changing" : mode === "change" ? "Change" : "Add"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => editPipeline(null)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </section>
  )
}

function doneText(count: number, target: Target, label?: string): string {
  const what = count === 1 ? "The section" : `${count} sections`
  switch (target.kind) {
    case "none":
      return `${what} ${count === 1 ? "is" : "are"} in no pipeline now.`
    case "new":
      return `${what} ${count === 1 ? "is" : "are"} in a new pipeline now. It has no name until a source gives one.`
    case "pipeline":
      return `${what} ${count === 1 ? "is" : "are"} in ${label ?? "the pipeline"} now.`
  }
}
