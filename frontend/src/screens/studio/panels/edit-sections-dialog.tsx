import { useMemo, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Icon } from "@/components/icons/icon"
import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import {
  editableAttributes,
  listWords,
  plural,
  sectionLabel,
  type SectionEdit,
} from "@/data/derive"
import { findEmbeddedDate, type DateParts } from "@/data/evidence"
import { dataSource } from "@/data/load-network"
import type { Section } from "@/data/schema"
import { attributeStoreKey } from "@/data/store/to-network"
import { cn } from "@/lib/utils"

import { DateField } from "./date-field"
import { useSaveSectionEdits } from "./section-edits"

/*
 * Edit, on section rows: one section, prefilled; several, a bulk edit with
 * the sections as chips (remove one to leave it out, add it back from the
 * same chip), a shared value where every active section agrees, and "Mixed"
 * where they do not. Only the fields a person actually changes are written.
 * Stock shadcn parts; the Figma frame for this does not exist yet (see
 * AGENTS.md and the brief).
 */

const MIXED = Symbol("mixed")

/** Earliest date first: missing month or day reads as the start of that year. */
function compareDateParts(a: DateParts, b: DateParts): number {
  const rank = (d: DateParts) =>
    d.year * 372 + ((d.month ?? 1) - 1) * 31 + ((d.day ?? 1) - 1)
  return rank(a) - rank(b)
}

/** Fields read top to bottom: what a section is, then when it was seen. */
const DETAIL_FIELDS = ["Diameter", "Status", "Geometry"]
const DATE_FIELDS = ["First seen", "Last seen", "Build date"]

function groupFields(
  attributes: string[]
): { label: string; attrs: string[] }[] {
  const details = DETAIL_FIELDS.filter((a) => attributes.includes(a))
  const dates = DATE_FIELDS.filter((a) => attributes.includes(a))
  const known = new Set([...details, ...dates])
  const rest = attributes.filter((a) => !known.has(a))
  return [
    { label: "Details", attrs: details },
    { label: "Dates", attrs: dates },
    { label: "Other", attrs: rest },
  ].filter((group) => group.attrs.length > 0)
}

export function EditSectionsDialog({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: Section[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {sections.length > 0 && (
          <EditSectionsForm
            // A fresh form, with its own state, whenever the target changes.
            key={sections.map((s) => s.id).join(",")}
            sections={sections}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditSectionsForm({
  sections,
  onDone,
}: {
  sections: Section[]
  onDone: () => void
}) {
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set())
  const active = sections.filter((s) => !excludedIds.has(s.id))
  const bulk = sections.length > 1
  const storeMode = dataSource() === "store"
  const save = useSaveSectionEdits()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const attributes = useMemo(() => editableAttributes(active), [active])
  const groups = useMemo(() => groupFields(attributes), [attributes])
  const shared = useMemo(() => {
    const map = new Map<string, string | null | typeof MIXED>()
    for (const attribute of attributes) {
      const values = new Set(
        active.map(
          (s) => s.claims.find((c) => c.attribute === attribute)?.value ?? null
        )
      )
      map.set(attribute, values.size === 1 ? [...values][0] : MIXED)
    }
    return map
  }, [active, attributes])

  const initialText = (attribute: string): string => {
    const value = shared.get(attribute)
    return value === MIXED || value === null || value === undefined ? "" : value
  }
  const current = (attribute: string): string =>
    fields[attribute] ?? initialText(attribute)
  const changedAttributes = attributes.filter(
    (attribute) =>
      attribute in fields && fields[attribute] !== initialText(attribute)
  )

  const toggleChip = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (active.length <= 1) return prev
        next.add(id)
      }
      return next
    })
  }

  const title = bulk
    ? `Edit ${active.length} sections`
    : `Edit section ${sectionLabel(active[0])}`
  const submitLabel = bulk ? `Update ${active.length} sections` : "Save"
  const firstFieldId = `edit-${groups[0]?.attrs[0]}`

  const firstSeen = attributes.includes("First seen")
    ? findEmbeddedDate(current("First seen"))
    : null
  const lastSeen = attributes.includes("Last seen")
    ? findEmbeddedDate(current("Last seen"))
    : null
  const dateOrderError =
    shared.get("First seen") !== MIXED &&
    shared.get("Last seen") !== MIXED &&
    firstSeen &&
    lastSeen &&
    compareDateParts(lastSeen.date, firstSeen.date) < 0
      ? "Last seen cannot be before First seen."
      : undefined

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (dateOrderError) return
    if (changedAttributes.length === 0) {
      onDone()
      return
    }
    setSaving(true)
    const edits: SectionEdit[] = changedAttributes.map((attribute) => {
      const text = current(attribute).trim()
      return { attribute, value: text === "" ? null : text }
    })
    const targetIds = active.map((s) => s.id)
    try {
      const undo = await save(targetIds, edits, note)
      toast(
        `Updated ${listWords(changedAttributes)} on ${plural(active.length, "section")}.`,
        undo ? { action: { label: "Undo", onClick: undo } } : undefined
      )
      onDone()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the edit."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader className="gap-1 border-b p-4">
        <DialogTitle>{title}</DialogTitle>
        {bulk && excludedIds.size > 0 && (
          <Hint>
            {active.length} of {sections.length} selected
          </Hint>
        )}
      </DialogHeader>
      <div className="flex flex-col gap-4 p-4">
        {bulk && (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {sections.map((section) => {
              const excluded = excludedIds.has(section.id)
              return (
                <Badge
                  key={section.id}
                  variant={excluded ? "outline" : "secondary"}
                  className={cn(excluded && "text-muted-foreground")}
                >
                  <span className={cn(excluded && "line-through")}>
                    {sectionLabel(section)}
                  </span>
                  <button
                    type="button"
                    aria-label={
                      excluded
                        ? `Add ${sectionLabel(section)} back`
                        : `Leave out ${sectionLabel(section)}`
                    }
                    disabled={!excluded && active.length <= 1}
                    onClick={() => toggleChip(section.id)}
                    className="-mr-0.5 rounded-full p-0.5 hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Icon
                      name={excluded ? "undo" : "close"}
                      className="size-2.5"
                    />
                  </button>
                </Badge>
              )
            })}
          </div>
        )}
        {groups.map((group, groupIndex) => {
          const groupKey = (attribute: string) => attributeStoreKey(attribute)
          return (
            <div
              key={group.label}
              className={cn(
                "flex flex-col gap-2",
                groupIndex > 0 && "border-t pt-4"
              )}
            >
              <GroupLabel className="h-auto">{group.label}</GroupLabel>
              <div className="flex flex-col gap-2.5">
                {group.attrs.map((attribute) => {
                  const isMixed = shared.get(attribute) === MIXED
                  const disabled = storeMode && groupKey(attribute) === null
                  const fieldId = `edit-${attribute}`
                  const changed = changedAttributes.includes(attribute)
                  const isDate = DATE_FIELDS.includes(attribute)
                  const fieldError =
                    attribute === "Last seen" ? dateOrderError : undefined
                  return (
                    <div key={attribute} className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor={fieldId}
                          className="flex w-24 shrink-0 items-center gap-1.5 type-ui-xs text-muted-foreground"
                        >
                          {attribute}
                          {changed && (
                            <span
                              aria-hidden="true"
                              className="size-1.5 shrink-0 rounded-full bg-ring"
                            />
                          )}
                        </label>
                        {isDate ? (
                          <DateField
                            id={fieldId}
                            value={current(attribute)}
                            isMixed={isMixed}
                            disabled={disabled}
                            autoFocus={fieldId === firstFieldId}
                            error={fieldError}
                            onChange={(next) =>
                              setFields((prev) => ({
                                ...prev,
                                [attribute]: next,
                              }))
                            }
                          />
                        ) : (
                          <InputGroup className="flex-1">
                            <InputGroupInput
                              id={fieldId}
                              value={current(attribute)}
                              placeholder={isMixed ? "Mixed" : undefined}
                              disabled={disabled}
                              autoFocus={fieldId === firstFieldId}
                              className="placeholder:italic"
                              onChange={(event) =>
                                setFields((prev) => ({
                                  ...prev,
                                  [attribute]: event.target.value,
                                }))
                              }
                            />
                            {changed && (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  aria-label={`Reset ${attribute}`}
                                  onClick={() =>
                                    setFields((prev) => {
                                      const next = { ...prev }
                                      delete next[attribute]
                                      return next
                                    })
                                  }
                                >
                                  <Icon name="undo" className="size-3" />
                                  Reset
                                </InputGroupButton>
                              </InputGroupAddon>
                            )}
                            {!changed && isMixed && (
                              <InputGroupAddon align="inline-end">
                                <Badge variant="outline" className="type-ui-xs">
                                  Mixed
                                </Badge>
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                        )}
                      </div>
                      {!changed && disabled && (
                        <Hint className="pl-[7.5rem] type-ui-xs">
                          Not editable yet
                        </Hint>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="flex items-center gap-3 border-t pt-4">
          <label
            htmlFor="edit-note"
            className="flex w-24 shrink-0 items-center type-ui-xs text-muted-foreground"
          >
            Note (optional)
          </label>
          <Input
            id="edit-note"
            value={note}
            placeholder="Why this changed"
            className="flex-1 placeholder:italic"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="m-0 items-center rounded-none border-t bg-transparent p-4">
        <span
          className="min-h-5 min-w-0 flex-1 self-center truncate type-ui-sm text-muted-foreground"
          title={
            changedAttributes.length > 0
              ? `Will update ${listWords(changedAttributes)} on ${plural(active.length, "section")}`
              : undefined
          }
        >
          {changedAttributes.length > 0
            ? `Will update ${listWords(changedAttributes)} on ${plural(active.length, "section")}`
            : "No changes yet"}
        </span>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          disabled={
            saving || changedAttributes.length === 0 || !!dateOrderError
          }
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
