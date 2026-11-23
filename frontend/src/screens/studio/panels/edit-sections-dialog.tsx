import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Icon } from "@/components/icons/icon"
import { GroupLabel } from "@/components/group-label"
import {
  EditModal,
  EditModalBody,
  EditModalField,
  EditModalFooter,
  EditModalHeader,
} from "@/components/edit-modal"
import { Hint } from "@/components/hint"
import { Badge } from "@/components/ui/badge"
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
import { WriteError } from "@/data/store/write"
import { typedError, writableOnStore } from "@/data/store/write-edits"
import { cn } from "@/lib/utils"

import { DateField } from "./date-field"
import { toastSaved } from "../editing/use-save-change"
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
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: Section[]
  /** Values the form opens with, by attribute: still the person's to check and save. */
  prefill?: Readonly<Record<string, string>>
}) {
  if (sections.length === 0) return null
  return (
    <EditSectionsForm
      // A fresh form, with its own state, whenever the target changes.
      key={sections.map((s) => s.id).join(",")}
      open={open}
      onOpenChange={onOpenChange}
      sections={sections}
      prefill={prefill}
    />
  )
}

function EditSectionsForm({
  open,
  onOpenChange,
  sections,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: Section[]
  prefill?: Readonly<Record<string, string>>
}) {
  const onDone = () => onOpenChange(false)
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set())
  const active = sections.filter((s) => !excludedIds.has(s.id))
  const bulk = sections.length > 1
  const storeMode = dataSource() === "store"
  const save = useSaveSectionEdits()
  const [fields, setFields] = useState<Record<string, string>>({ ...prefill })
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const attributes = useMemo(() => editableAttributes(active), [active])
  const groups = useMemo(() => groupFields(attributes), [attributes])
  const shared = useMemo(() => {
    const map = new Map<string, string | null | typeof MIXED>()
    for (const attribute of attributes) {
      const values = new Set(
        active.map(
          (s) => s.values.find((c) => c.attribute === attribute)?.value ?? null
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

  // Store's rules for a typed value (edit-rules.ts), on every changed field.
  const typedErrors = new Map(
    changedAttributes.flatMap((attribute) => {
      const error = typedError(attribute, current(attribute))
      return error ? [[attribute, error] as const] : []
    })
  )
  const errorOf = (attribute: string): string | undefined =>
    attribute === "Last seen" ? dateOrderError : typedErrors.get(attribute)
  const blocked = !!dateOrderError || typedErrors.size > 0

  const onSubmit = async () => {
    if (blocked) return
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
      toastSaved(
        `Updated ${listWords(changedAttributes)} on ${plural(active.length, "section")}.`,
        undo
      )
      onDone()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save the edit."
      // Store's own reason, when it gave one, so the person can act on it.
      if (error instanceof WriteError && error.detail) {
        toast.error(message, { description: error.detail })
      } else {
        toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const summary =
    changedAttributes.length > 0
      ? `Will update ${listWords(changedAttributes)} on ${plural(active.length, "section")}`
      : undefined

  return (
    <EditModal
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={() => void onSubmit()}
    >
      <EditModalHeader
        title={title}
        meta={
          bulk && excludedIds.size > 0 ? (
            <Hint>
              {active.length} of {sections.length} selected
            </Hint>
          ) : undefined
        }
      />
      <EditModalBody>
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
        {groups.map((group, groupIndex) => (
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
                const disabled = storeMode && !writableOnStore(attribute)
                const fieldId = `edit-${attribute}`
                const changed = changedAttributes.includes(attribute)
                const isDate = DATE_FIELDS.includes(attribute)
                const fieldError = errorOf(attribute)
                return (
                  <EditModalField
                    key={attribute}
                    id={fieldId}
                    label={
                      <>
                        {attribute}
                        {changed && (
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-ring"
                          />
                        )}
                      </>
                    }
                    // A date field says its own mistake, under its own parts.
                    error={isDate ? undefined : fieldError}
                    hint={
                      !changed && disabled ? (
                        <Hint className="type-ui-xs">Not editable yet</Hint>
                      ) : undefined
                    }
                  >
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
                          aria-invalid={!!fieldError}
                          aria-describedby={
                            fieldError ? `${fieldId}-error` : undefined
                          }
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
                  </EditModalField>
                )
              })}
            </div>
          </div>
        ))}
        <div className="border-t pt-4">
          <EditModalField
            id="edit-note"
            label="Note (optional)"
            hint="Kept as the source of the change, shown with its citation."
          >
            <Input
              id="edit-note"
              value={note}
              placeholder="Why this changed"
              className="placeholder:italic"
              onChange={(event) => setNote(event.target.value)}
            />
          </EditModalField>
        </div>
      </EditModalBody>
      <EditModalFooter
        summary={summary}
        action={submitLabel}
        // With nothing changed the action waits; Cancel closes.
        ready={changedAttributes.length > 0 && !blocked}
        saving={saving}
      />
    </EditModal>
  )
}
