import { useId, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { DateRangePicker } from "@/components/date-range-picker"
import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { YearPicker } from "@/components/year-picker"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addedSpan,
  buildYearSpan,
  companiesOf,
  diameterOf,
  filterCounts,
  formatCount,
  MEMBERSHIP_LABEL,
  MEMBERSHIPS,
  membershipOf,
  optionCounts,
  plural,
  unknownCounts,
} from "@/data/derive"
import { STATUSES, STATUS_LABEL } from "@/data/status"
import { cn } from "@/lib/utils"

import { HidePanels } from "../panel-toggle"
import { useCriteria, useStudioData } from "../studio-data"
import { filtersApplied, useStudio } from "../studio-store"

/*
 * The second level of the list panel: every filter on one screen, in place
 * of the list, with the way back and a live count (the owner, 2026-11-13).
 * Every group always shows; with nothing to choose from it says so in one
 * line, so a filter never seems to be missing. The counts beside options
 * are sections of the whole edition with the other filters on: what
 * choosing that option would show.
 */

function Group({
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
function OptionRow({
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
function CheckList({
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
function MultiPick({
  noun,
  options,
  value,
  onChange,
}: {
  /** "companies", "states": for the search box and its empty line. */
  noun: string
  options: { name: string; count: number }[]
  value: readonly string[]
  onChange: (next: string[]) => void
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
      value={value as string[]}
      onValueChange={(next) => onChange(next)}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(chosen: string[]) => (
            <>
              {chosen.map((name) => (
                <ComboboxChip key={name} aria-label={name}>
                  <span className="max-w-44 truncate">{name}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={`Search ${noun}`}
                placeholder={chosen.length === 0 ? `Search ${noun}` : ""}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList>
          {(name: string) => (
            <ComboboxItem key={name} value={name}>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="type-ui-mono-xs text-muted-foreground">
                {formatCount(countOf.get(name) ?? 0)}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const ANY = "any"

/** One end of a range of edition years. */
function EditionYear({
  label,
  placeholder,
  years,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  years: number[]
  value: number | null
  onChange: (year: number | null) => void
}) {
  const items = [
    { value: ANY, label: placeholder },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]
  return (
    <Select
      items={items}
      value={value === null ? ANY : String(value)}
      onValueChange={(next) =>
        onChange(!next || next === ANY ? null : Number(next))
      }
    >
      <SelectTrigger size="sm" aria-label={label} className="min-w-0 flex-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** More options than this and a list of boxes becomes a search with chips. */
const LONG_LIST = 8

/** Build years can be picked up to the present, whatever the data holds. */
const THIS_YEAR = new Date().getFullYear()

/**
 * The filters, shown in place of the list in the same panel so the map stays
 * in sight while they are set. `onBack` returns to the list.
 */
export function FiltersPanel({ onBack }: { onBack: () => void }) {
  const { everySection: summaries, owners, network, statesOf } = useStudioData()
  const criteria = useCriteria()
  // Only what this view reads, so panning the map does not redraw it.
  const s = useStudio(
    useShallow((x) => ({
      status: x.status,
      needsDecisionOnly: x.needsDecisionOnly,
      changedOnly: x.changedOnly,
      memberships: x.memberships,
      firstSeenFrom: x.firstSeenFrom,
      firstSeenTo: x.firstSeenTo,
      states: x.states,
      companies: x.companies,
      diameters: x.diameters,
      builtFrom: x.builtFrom,
      builtTo: x.builtTo,
      addedFrom: x.addedFrom,
      addedTo: x.addedTo,
      unknownIn: x.unknownIn,
      setStatus: x.setStatus,
      setNeedsDecisionOnly: x.setNeedsDecisionOnly,
      setChangedOnly: x.setChangedOnly,
      setMemberships: x.setMemberships,
      setFirstSeen: x.setFirstSeen,
      setStates: x.setStates,
      setCompanies: x.setCompanies,
      setDiameters: x.setDiameters,
      setBuilt: x.setBuilt,
      setAdded: x.setAdded,
      toggleUnknownIn: x.toggleUnknownIn,
      clearFilters: x.clearFilters,
    }))
  )
  const filtered = useStudio(filtersApplied)

  // Sections of the whole edition, after the other filters. They never
  // follow the map: moving it or opening the table does not change them.
  const counts = useMemo(
    () => filterCounts(summaries, criteria),
    [summaries, criteria]
  )
  const matching =
    criteria.status === "all" ? counts.all : counts.status[criteria.status]

  const memberships = useMemo(() => {
    const found = optionCounts(summaries, criteria, "memberships", (x) => [
      membershipOf(x),
    ])
    const count = new Map(found.map((o) => [o.name, o.count]))
    return MEMBERSHIPS.map((m) => ({ name: m, count: count.get(m) ?? 0 }))
  }, [summaries, criteria])
  const changed = useMemo(
    () =>
      optionCounts(summaries, criteria, "changedOnly", (x) =>
        x.changedSinceReview ? ["changed"] : []
      )[0]?.count ?? 0,
    [summaries, criteria]
  )
  const states = useMemo(
    () =>
      optionCounts(
        summaries,
        criteria,
        "states",
        (x) => statesOf.get(x.id) ?? []
      ),
    [summaries, criteria, statesOf]
  )
  const companies = useMemo(
    () =>
      optionCounts(summaries, criteria, "companies", (x) =>
        companiesOf(x, owners)
      ),
    [summaries, criteria, owners]
  )
  const diameters = useMemo(
    () => optionCounts(summaries, criteria, "diameters", diameterOf),
    [summaries, criteria]
  )
  const attributes = useMemo(
    () =>
      [...unknownCounts(summaries)].map(([name, count]) => ({ name, count })),
    [summaries]
  )
  const editionYears = useMemo(
    () =>
      [...new Set(network.editions.map((e) => e.year))].sort((a, b) => a - b),
    [network]
  )
  const span = useMemo(() => buildYearSpan(summaries), [summaries])
  const added = useMemo(() => addedSpan(summaries), [summaries])

  return (
    <>
      <PanelHeader
        title="Filters"
        divider
        className="pl-1.5"
        leading={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to the list"
            onClick={onBack}
          >
            <Icon name="arrow-left" />
          </Button>
        }
      >
        <HidePanels />
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <Group
          title="Status"
          on={s.status !== "all" || s.needsDecisionOnly || s.changedOnly}
          onClear={() => {
            s.setStatus("all")
            s.setNeedsDecisionOnly(false)
            s.setChangedOnly(false)
          }}
        >
          {/* One status at a time; the boxes below narrow any of them. */}
          <div
            role="group"
            aria-label="Sections by status"
            className="flex flex-col gap-0.5"
          >
            <RadioGroup
              aria-label="Status"
              value={s.status}
              onValueChange={(value) => s.setStatus(value as typeof s.status)}
              className="gap-0.5"
            >
              {(["all", ...STATUSES] as const).map((x) => (
                <OptionRow
                  key={x}
                  control={<RadioGroupItem value={x} />}
                  label={x === "all" ? "All" : STATUS_LABEL[x]}
                  count={x === "all" ? counts.all : counts.status[x]}
                  selected={s.status === x}
                />
              ))}
            </RadioGroup>
            <OptionRow
              control={
                <Checkbox
                  checked={s.needsDecisionOnly}
                  onCheckedChange={(on) => s.setNeedsDecisionOnly(on === true)}
                />
              }
              label="Needs your decision"
              count={counts.needsDecision}
              selected={s.needsDecisionOnly}
            />
            <OptionRow
              control={
                <Checkbox
                  checked={s.changedOnly}
                  onCheckedChange={(on) => s.setChangedOnly(on === true)}
                />
              }
              label="Changed since review"
              count={changed}
              selected={s.changedOnly}
            />
          </div>
        </Group>

        <Group
          title="Pipeline"
          on={s.memberships.length > 0}
          onClear={() => s.setMemberships([])}
        >
          <CheckList
            label="Pipeline"
            options={memberships}
            value={s.memberships}
            onChange={(next) => s.setMemberships(next as typeof s.memberships)}
            name={(m) => MEMBERSHIP_LABEL[m as keyof typeof MEMBERSHIP_LABEL]}
          />
        </Group>

        <Group
          title="First seen"
          on={s.firstSeenFrom !== null || s.firstSeenTo !== null}
          onClear={() => s.setFirstSeen(null, null)}
        >
          <div className="flex items-center gap-2">
            <EditionYear
              label="First seen from edition"
              placeholder="From"
              years={editionYears.filter(
                (y) => s.firstSeenTo === null || y <= s.firstSeenTo
              )}
              value={s.firstSeenFrom}
              onChange={(year) => s.setFirstSeen(year, s.firstSeenTo)}
            />
            <span className="type-ui-sm text-muted-foreground">to</span>
            <EditionYear
              label="First seen to edition"
              placeholder="To"
              years={editionYears.filter(
                (y) => s.firstSeenFrom === null || y >= s.firstSeenFrom
              )}
              value={s.firstSeenTo}
              onChange={(year) => s.setFirstSeen(s.firstSeenFrom, year)}
            />
          </div>
        </Group>

        <Group
          title="State"
          on={s.states.length > 0}
          onClear={() => s.setStates([])}
        >
          {states.length === 0 ? (
            <Hint>No section runs through a US state.</Hint>
          ) : (
            <MultiPick
              noun="states"
              options={states}
              value={s.states}
              onChange={s.setStates}
            />
          )}
        </Group>

        <Group
          title="Company"
          on={s.companies.length > 0}
          onClear={() => s.setCompanies([])}
        >
          {companies.length === 0 ? (
            <Hint>No section or pipeline has a cited owner yet.</Hint>
          ) : (
            <MultiPick
              noun="companies"
              options={companies}
              value={s.companies}
              onChange={s.setCompanies}
            />
          )}
        </Group>

        <Group
          title="Diameter"
          on={s.diameters.length > 0}
          onClear={() => s.setDiameters([])}
        >
          {diameters.length === 0 ? (
            <Hint>No section has a cited diameter yet.</Hint>
          ) : diameters.length > LONG_LIST ? (
            <MultiPick
              noun="diameters"
              options={diameters}
              value={s.diameters}
              onChange={s.setDiameters}
            />
          ) : (
            <CheckList
              label="Diameter"
              options={diameters}
              value={s.diameters}
              onChange={s.setDiameters}
            />
          )}
        </Group>

        <Group
          title="Build date"
          on={s.builtFrom !== null || s.builtTo !== null}
          onClear={() => s.setBuilt(null, null)}
        >
          {!span ? (
            <Hint>No section has a cited build date yet.</Hint>
          ) : (
            <div className="flex items-center gap-2">
              <YearPicker
                label="Built from year"
                value={s.builtFrom}
                onChange={(year) => s.setBuilt(year, s.builtTo)}
                min={span[0]}
                max={s.builtTo ?? THIS_YEAR}
                first={span[0]}
                placeholder="From"
              />
              <span className="type-ui-sm text-muted-foreground">to</span>
              <YearPicker
                label="Built to year"
                value={s.builtTo}
                onChange={(year) => s.setBuilt(s.builtFrom, year)}
                min={s.builtFrom ?? span[0]}
                first={span[0]}
                max={THIS_YEAR}
                placeholder="To"
              />
            </div>
          )}
        </Group>

        <Group
          title="Added to Lineage"
          on={s.addedFrom !== null || s.addedTo !== null}
          onClear={() => s.setAdded(null, null)}
        >
          {!added ? (
            <Hint>No section says when it was added.</Hint>
          ) : (
            <DateRangePicker
              label="Added to Lineage"
              from={s.addedFrom}
              to={s.addedTo}
              onChange={s.setAdded}
              min={added[0]}
              max={added[1]}
            />
          )}
        </Group>

        <Group
          title="Unknown in"
          on={s.unknownIn.length > 0}
          onClear={() => s.unknownIn.forEach(s.toggleUnknownIn)}
        >
          {attributes.length === 0 ? (
            <Hint>No section has an attribute yet.</Hint>
          ) : (
            <CheckList
              label="Unknown in"
              options={attributes}
              value={s.unknownIn}
              onChange={(next) => {
                // A box toggles one attribute; find which one changed.
                const changedName =
                  next.find((n) => !s.unknownIn.includes(n)) ??
                  s.unknownIn.find((n) => !next.includes(n))
                if (changedName) s.toggleUnknownIn(changedName)
              }}
            />
          )}
        </Group>
      </div>

      <PanelFooter className="justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!filtered}
          onClick={s.clearFilters}
        >
          Clear all
        </Button>
        <Button size="sm" onClick={onBack} aria-live="polite">
          Show {plural(matching, "section")}
        </Button>
      </PanelFooter>
    </>
  )
}
