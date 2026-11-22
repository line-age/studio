import { useId, useMemo } from "react"

import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
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
 * chips for many options, and a range of lengths in km.
 */

/** One filter in the Filters panel: its heading, Clear while it is on, its control. */
export function Group({
  title,
  on,
  onClear,
  children,
}: {
  /** The filter's name, as the group's heading: "Length". */
  title: string
  /** The group's filter is on: it offers Clear. */
  on: boolean
  /** Clear was pressed: turn this filter off. */
  onClear: () => void
  /** The filter's control. */
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
  /** The box or radio that chooses it; the whole row is its label. */
  control: React.ReactNode
  /** What the choice is: "Needs your decision". */
  label: string
  /** How many sections it would leave, after the other filters. */
  count: number
  /** It is chosen: its label turns medium. */
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
  /** The list's name, for a screen reader: "Proposed end". */
  label: string
  /** Every option, by its key, with how many sections it would leave. */
  options: { name: string; count: number }[]
  /** The keys ticked. */
  value: readonly string[]
  /** A box was ticked or unticked: the keys ticked now. */
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
  /** Every option, by its key, with how many sections it would leave. */
  options: { name: string; count: number }[]
  /** The keys picked, shown as chips. */
  value: readonly string[]
  /** One was picked or removed: the keys picked now. */
  onChange: (next: string[]) => void
  /** How an option reads, when its value is a key. Typing finds it by this. */
  name?: (option: string) => string
}) {
  const anchor = useComboboxAnchor()
  // The control takes an array of its own; one per new value, not per render.
  const chosen = useMemo(() => [...value], [value])
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
      value={chosen}
      onValueChange={(next) => onChange(next)}
    >
      <ComboboxChips ref={anchor} className="w-full">
        {/* A search, as Figma draws it: the glass before what is typed. */}
        <Icon
          name="search"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <ComboboxValue>
          {(chosen: string[]) => (
            <>
              {chosen.map((option) => (
                <ComboboxChip
                  key={option}
                  aria-label={name(option)}
                  removeLabel={`Remove ${name(option)}`}
                >
                  <span className="max-w-44 truncate">{name(option)}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={`Search ${noun}`}
                name={`filter-${noun}`}
                autoComplete="off"
                spellCheck={false}
                placeholder={chosen.length === 0 ? placeholder : ""}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList aria-label={noun}>
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

/**
 * How long a section is, from and to, in whole km. Either end may be empty,
 * and asks for nothing. A range that runs backwards marks both boxes and says
 * why, since no section can match it.
 */
export function LengthRange({
  from,
  to,
  onChange,
  bounds,
}: {
  /** The shortest length asked for, in km; null asks for none. */
  from: number | null
  /** The longest length asked for, in km; null asks for none. */
  to: number | null
  /** Either end was typed or emptied: both ends now. */
  onChange: (from: number | null, to: number | null) => void
  /** The shortest and longest section, shown as the placeholders. */
  bounds: readonly [number, number] | null
}) {
  const backwardsId = useId()
  const backwards = from !== null && to !== null && from > to
  const describedBy = backwards ? backwardsId : undefined
  return (
    <>
      <div className="flex items-center gap-2">
        <Km
          label="Length from, km"
          name="length-from"
          placeholder={bounds ? String(bounds[0]) : "From"}
          value={from}
          onChange={(km) => onChange(km, to)}
          invalid={backwards}
          describedBy={describedBy}
        />
        <span className="type-ui-sm text-muted-foreground">to</span>
        <Km
          label="Length to, km"
          name="length-to"
          placeholder={bounds ? String(bounds[1]) : "To"}
          value={to}
          onChange={(km) => onChange(from, km)}
          invalid={backwards}
          describedBy={describedBy}
        />
        <span className="type-ui-sm text-muted-foreground">km</span>
      </div>
      {backwards && (
        <Hint id={backwardsId} role="status">
          From is more than to, so no section can match.
        </Hint>
      )}
    </>
  )
}

/** One end of a length range, in whole km. Empty asks for nothing. */
function Km({
  label,
  name,
  placeholder,
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  label: string
  /** The field's name, for the browser: "length-from". */
  name: string
  placeholder: string
  value: number | null
  onChange: (km: number | null) => void
  /** The range runs backwards: marked, and pointed at what says so. */
  invalid?: boolean
  describedBy?: string
}) {
  return (
    <Input
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      name={name}
      autoComplete="off"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(event) => {
        const km = event.target.valueAsNumber
        onChange(Number.isFinite(km) && km >= 0 ? km : null)
      }}
      className="h-control-sm min-w-0 flex-1"
    />
  )
}
