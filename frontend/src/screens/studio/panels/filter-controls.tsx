import { useId, useMemo } from "react"

import { GroupLabel } from "@/components/group-label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { formatCount } from "@/data/derive"
import { cn } from "@/lib/utils"

/*
 * The controls the Filters panel is made of: a group with its title and
 * Clear, a row per option with its count, a list of boxes, a search with
 * chips for many options, and one end of a range in km.
 */

export function Group({
  title,
  on,
  onClear,
  children,
}: {
  title: string
  /** The group's filter is on: it offers Clear. */
  on: boolean
  onClear: () => void
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b p-3">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <GroupLabel id={id}>{title}</GroupLabel>
        {on && (
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Clear ${title}`}
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

/** One choice in a filter group: the control, its label, and how many match. */
export function OptionRow({
  control,
  label,
  count,
  selected,
}: {
  control: React.ReactNode
  label: string
  count: number
  selected: boolean
}) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-muted">
      {control}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          selected ? "type-ui-sm-medium" : "type-ui-sm"
        )}
      >
        {label}
      </span>
      <span className="type-ui-mono-xs text-muted-foreground">
        {formatCount(count)}
      </span>
    </label>
  )
}

/** Options with a box each: any number of them at once. */
export function CheckList({
  label,
  options,
  value,
  onChange,
  name = (option) => option,
}: {
  label: string
  options: { name: string; count: number }[]
  value: readonly string[]
  onChange: (next: string[]) => void
  /** How an option reads, when its value is a key. */
  name?: (option: string) => string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      {options.map((option) => {
        const on = value.includes(option.name)
        return (
          <OptionRow
            key={option.name}
            control={
              <Checkbox
                checked={on}
                onCheckedChange={() =>
                  onChange(
                    on
                      ? value.filter((v) => v !== option.name)
                      : [...value, option.name]
                  )
                }
              />
            }
            label={name(option.name)}
            count={option.count}
            selected={on}
          />
        )
      })}
    </div>
  )
}

/** Many options: type to find one; the chosen ones stay as chips. */
export function MultiPick({
  noun,
  placeholder = `Search ${noun}`,
  options,
  value,
  onChange,
  name = (option) => option,
}: {
  /** "companies", "states": for the search box and its empty line. */
  noun: string
  /** What the empty search box says. */
  placeholder?: string
  options: { name: string; count: number }[]
  value: readonly string[]
  onChange: (next: string[]) => void
  /** How an option reads, when its value is a key. Typing finds it by this. */
  name?: (option: string) => string
}) {
  const anchor = useComboboxAnchor()
  const names = useMemo(() => options.map((o) => o.name), [options])
  const countOf = useMemo(
    () => new Map(options.map((o) => [o.name, o.count])),
    [options]
  )
  return (
    <Combobox
      multiple
      autoHighlight
      limit={50}
      items={names}
      itemToStringLabel={name}
      value={value as string[]}
      onValueChange={(next) => onChange(next)}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(chosen: string[]) => (
            <>
              {chosen.map((option) => (
                <ComboboxChip key={option} aria-label={name(option)}>
                  <span className="max-w-44 truncate">{name(option)}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={`Search ${noun}`}
                placeholder={chosen.length === 0 ? placeholder : ""}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList>
          {(option: string) => (
            <ComboboxItem key={option} value={option}>
              <span className="min-w-0 flex-1 truncate">{name(option)}</span>
              <span className="type-ui-mono-xs text-muted-foreground">
                {formatCount(countOf.get(option) ?? 0)}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** One end of a range of lengths, in whole km. Empty asks for nothing. */
export function Km({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: number | null
  onChange: (km: number | null) => void
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(event) => {
        const km = event.target.valueAsNumber
        onChange(Number.isFinite(km) && km >= 0 ? km : null)
      }}
      className="h-7 min-w-0 flex-1"
    />
  )
}
