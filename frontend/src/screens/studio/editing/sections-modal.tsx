import { useRef, useState } from "react"

import {
  EditModal,
  EditModalBody,
  EditModalFooter,
  EditModalHeader,
} from "@/components/edit-modal"
import { Icon } from "@/components/icons/icon"
import { Hint } from "@/components/hint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  geometryBounds,
  listWords,
  pipelineLabel,
  plural,
  unionBounds,
} from "@/data/derive"
import type { Pipeline, Section } from "@/data/schema"
import { actionKey } from "@/data/store/write"
import { cn } from "@/lib/utils"

import { useStudioData } from "../studio-data"
import { useStudio, type SectionsDraft } from "../studio-store"
import { ModalSectionRow } from "./modal-section-row"
import { useSave } from "./use-save-change"

/*
 * Sections of a pipeline (Figma `472:17366`), from its row's menu. Find a
 * section by code or name, or Pick on the map (the modal folds into a bar,
 * `475:17477`). Remove with the row's button: it stays listed, struck
 * through, with Undo. Nothing changes until Save, which writes it all in one
 * bundle.
 */

/** How many matches the search lists. */
const MATCHES = 8

/** "Will add 2 sections and remove 1". */
export function sectionsSummary(
  add: number,
  remove: number
): string | undefined {
  const parts = [
    add > 0 ? `add ${plural(add, "section")}` : null,
    remove > 0
      ? `remove ${add > 0 ? remove : plural(remove, "section")}`
      : null,
  ].filter(Boolean)
  return parts.length > 0 ? `Will ${parts.join(" and ")}` : undefined
}

/** The toast once saved: "Added 2 sections to Tolland and removed 1." */
function savedText(add: number, remove: number, pipeline: string): string {
  if (add > 0 && remove > 0)
    return `Added ${plural(add, "section")} to ${pipeline} and removed ${remove}.`
  return add > 0
    ? `Added ${plural(add, "section")} to ${pipeline}.`
    : `Removed ${plural(remove, "section")} from ${pipeline}.`
}

export function SectionsModal({
  pipeline,
  draft,
  onClose,
}: {
  pipeline: Pipeline
  draft: SectionsDraft
  onClose: () => void
}) {
  const { network } = useStudioData()
  const draftSections = useStudio((s) => s.draftSections)
  const startPicking = useStudio((s) => s.startPicking)
  const requestFit = useStudio((s) => s.requestFit)
  const [query, setQuery] = useState("")
  // One key per draft saved: a retry of the same draft makes nothing twice.
  const key = useRef(actionKey())
  const sent = useRef("")
  const { save, saving, failure, clearFailure } = useSave(onClose)

  const byId = new Map(network.sections.map((s) => [s.id, s]))
  const members = network.sections.filter((s) => s.pipelineId === pipeline.id)
  const added = draft.add.flatMap((id) => byId.get(id) ?? [])
  const removing = new Set(draft.remove)
  const labelOf = (id: string | null) => {
    const p = network.pipelines.find((x) => x.id === id)
    return p ? pipelineLabel(p) : null
  }
  const set = (add: readonly string[], remove: readonly string[]) => {
    clearFailure()
    draftSections(add, remove)
  }
  const toggle = (ids: readonly string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]

  const words = query.trim().toLowerCase()
  const matches = words
    ? network.sections
        .filter(
          (s) =>
            s.code.toLowerCase().includes(words) ||
            (s.name ?? "").toLowerCase().includes(words)
        )
        .slice(0, MATCHES)
    : []
  const leaving = added.filter((s) => s.pipelineId !== null)
  const summary = sectionsSummary(added.length, removing.size)

  const row = (section: Section) => {
    if (draft.add.includes(section.id)) {
      const from = labelOf(section.pipelineId)
      return (
        <ModalSectionRow
          key={section.id}
          code={section.code}
          name={section.name}
          tone="added"
          state={from ? `New · leaves ${from}` : "New"}
          action="Undo"
          onAction={() => set(toggle(draft.add, section.id), draft.remove)}
        />
      )
    }
    const out = removing.has(section.id)
    return (
      <ModalSectionRow
        key={section.id}
        code={section.code}
        name={section.name}
        tone={out ? "removed" : "default"}
        state={out ? "Will be removed" : null}
        action={out ? "Undo" : "Remove"}
        onAction={() => set(draft.add, toggle(draft.remove, section.id))}
      />
    )
  }

  return (
    <EditModal
      open
      size="list"
      onOpenChange={(open) => !open && !saving && onClose()}
      onSubmit={() => {
        if (!summary) return
        const what = `${[...draft.add].sort()}|${[...draft.remove].sort()}`
        if (what !== sent.current) key.current = actionKey()
        sent.current = what
        void save(
          {
            kind: "members",
            pipelineId: pipeline.id,
            add: draft.add,
            remove: draft.remove,
          },
          key.current,
          savedText(added.length, removing.size, pipelineLabel(pipeline))
        )
      }}
    >
      <EditModalHeader
        title={`Sections of ${pipelineLabel(pipeline)}`}
        meta={plural(members.length, "section")}
      />
      <EditModalBody>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-controls="sections-matches"
              aria-label="Add a section: code or name"
              placeholder="Add a section: code or name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {matches.length > 0 && (
              <ul
                id="sections-matches"
                role="listbox"
                aria-label="Sections found"
                className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
              >
                {matches.map((s) => {
                  const inThis = s.pipelineId === pipeline.id
                  const where = labelOf(s.pipelineId) ?? "In no pipeline"
                  return (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={false}
                      aria-disabled={inThis || undefined}
                      tabIndex={-1}
                      className={cn(
                        "flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5 hover:bg-muted",
                        inThis && "pointer-events-none opacity-50"
                      )}
                      onClick={() => {
                        if (!draft.add.includes(s.id))
                          set([s.id, ...draft.add], draft.remove)
                        setQuery("")
                      }}
                    >
                      <span className="type-ui-mono-xs">{s.code}</span>
                      <span className="min-w-0 flex-1 truncate type-ui-sm">
                        {s.name ?? ""}
                      </span>
                      <span className="shrink-0 type-ui-xs text-muted-foreground">
                        {inThis ? "In this pipeline" : where}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // The map frames the pipeline and what is added so far, so the
              // picks are in view when the modal folds away.
              const bounds = unionBounds(
                [...members, ...added].map((s) => geometryBounds(s.geometry))
              )
              if (bounds) requestFit(bounds)
              startPicking()
            }}
          >
            <Icon name="tool-select" className="size-3.5" />
            Pick on the map
          </Button>
        </div>
        {leaving.length > 0 && (
          <Hint className="type-ui-xs">
            {listWords(
              leaving.map((s) => `${s.code} is in ${labelOf(s.pipelineId)}`)
            )}{" "}
            and will leave {leaving.length === 1 ? "it" : "them"}.
          </Hint>
        )}
        <ul
          aria-label={`Sections of ${pipelineLabel(pipeline)}`}
          className="max-h-[360px] overflow-y-auto rounded-md border"
        >
          {added.map(row)}
          {members.map(row)}
          {members.length === 0 && added.length === 0 && (
            <li className="px-3 py-2">
              <Hint>
                No sections yet. Add one by its code or name, or pick it on the
                map.
              </Hint>
            </li>
          )}
        </ul>
      </EditModalBody>
      <EditModalFooter
        summary={summary}
        action="Save changes"
        ready={!!summary}
        saving={saving}
        failure={failure}
      />
    </EditModal>
  )
}
