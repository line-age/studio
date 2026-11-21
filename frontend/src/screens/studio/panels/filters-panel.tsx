import { useId, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { DateRangePicker } from "@/components/date-range-picker"
import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { YearPicker } from "@/components/year-picker"
import { Input } from "@/components/ui/input"
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
  addedSpan,
  attributeNames,
  buildYearSpan,
  companiesOf,
  diameterOf,
  filterCounts,
  formatCount,
  buildYear,
  canNarrow,
  firstSeenEditionId,
  lengthKm,
  optionCounts,
  passingWithout,
  plural,
  PROPOSED_END_LABEL,
  proposedEndKinds,
  rangeNarrows,
  tracerNames,
  tracerOf,
  PROPOSED_ENDS,
  unknownAttributesOf,
} from "@/data/derive"
import { STATUSES, STATUS_LABEL } from "@/data/status"
import { cn } from "@/lib/utils"

import { HidePanels } from "../panel-toggle"
import { useCriteria, useStudioData } from "../studio-data"
import {
  filtersApplied,
  sectionFiltersPaused,
  useStudio,
} from "../studio-store"

/*
 * The second level of the list panel: every filter on one screen, in place
 * of the list, with the way back and a live count (the owner, 2026-11-13).
 * A group shows while it is on, or while it can narrow what the switch
 * shows: one of its choices would leave some sections and not all of them
 * (the owner, 2026-11-21). A filter with nothing to tell apart, as on data
 * that has no diameters yet, is left out and comes back by itself. Status
 * always shows. The filters about a section on its own (first shown by,
 * state, length, proposed end) are offered on All and on Unplaced only. The
 * counts beside options are sections the switch shows with the other filters
 * on: what choosing that option would show.
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
function Km({
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

/** More options than this and a list of boxes becomes a search with chips. */
const LONG_LIST = 8

/** Build years can be picked up to the present, whatever the data holds. */
const THIS_YEAR = new Date().getFullYear()

/**
 * The filters, shown in place of the list in the same panel so the map stays
 * in sight while they are set. `onBack` returns to the list.
 */
export function FiltersPanel({ onBack }: { onBack: () => void }) {
  const {
    scoped: summaries,
    owners,
    network,
    statesOf,
    editionYears,
  } = useStudioData()
  const criteria = useCriteria()
  // Only what this view reads, so panning the map does not redraw it.
  const s = useStudio(
    useShallow((x) => ({
      status: x.status,
      needsDecisionOnly: x.needsDecisionOnly,
      changedOnly: x.changedOnly,
      firstSeenEditions: x.firstSeenEditions,
      lengthFrom: x.lengthFrom,
      lengthTo: x.lengthTo,
      proposedEnd: x.proposedEnd,
      tracers: x.tracers,
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
      setFirstSeenEditions: x.setFirstSeenEditions,
      setLength: x.setLength,
      setProposedEnd: x.setProposedEnd,
      setTracers: x.setTracers,
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
  // On Pipelines the filters about a section on its own are not offered.
  const paused = useStudio(sectionFiltersPaused)

  // Sections of the whole edition, after the other filters. They never
  // follow the map: moving it or opening the table does not change them.
  const counts = useMemo(
    () => filterCounts(summaries, criteria),
    [summaries, criteria]
  )
  const matching =
    criteria.status === "all" ? counts.all : counts.status[criteria.status]

  // How many sections each group has to choose among: what passes every
  // filter but its own. A choice that leaves all of them narrows nothing.
  // Counted once for what is shown, not on every redraw.
  const totals = useMemo(() => {
    const keys = [
      "firstSeenEditions",
      "tracers",
      "states",
      "proposedEnd",
      "companies",
      "diameters",
      "unknownIn",
      "changedOnly",
    ] as const
    return Object.fromEntries(
      keys.map((key) => [key, passingWithout(summaries, criteria, key)])
    ) as Record<(typeof keys)[number], number>
  }, [summaries, criteria])
  const among = (key: keyof typeof totals) => totals[key]
  const editionLabel = (id: string) =>
    network.editions.find((e) => e.id === id)?.label ?? id
  const editions = useMemo(() => {
    const found = optionCounts(
      summaries,
      criteria,
      "firstSeenEditions",
      (x) => {
        const first = firstSeenEditionId(x, editionYears)
        return first === null ? [] : [first]
      }
    )
    // Oldest first, as the list has them.
    return found.sort(
      (a, b) =>
        (editionYears.get(a.name) ?? 0) - (editionYears.get(b.name) ?? 0)
    )
  }, [summaries, criteria, editionYears])
  // Who traced each section. Named on the screen; chosen and linked by id.
  const tracerName = useMemo(() => {
    const names = tracerNames(network.sections)
    return (id: string) => names.get(id) ?? "Someone the data no longer names"
  }, [network])
  const tracers = useMemo(
    () => optionCounts(summaries, criteria, "tracers", tracerOf),
    [summaries, criteria]
  )
  const ends = useMemo(() => {
    const found = optionCounts(
      summaries,
      criteria,
      "proposedEnd",
      proposedEndKinds
    )
    const count = new Map(found.map((o) => [o.name, o.count]))
    return PROPOSED_ENDS.map((kind) => ({
      name: kind as string,
      count: count.get(kind) ?? 0,
    }))
  }, [summaries, criteria])
  // The shortest and the longest line the switch shows, in whole km.
  const lengths = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const summary of summaries) {
      for (const section of summary.sections) {
        const km = lengthKm(section)
        if (km < min) min = km
        if (km > max) max = km
      }
    }
    return min <= max ? ([Math.floor(min), Math.ceil(max)] as const) : null
  }, [summaries])
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
  // Like every other group: counted after the other filters, so a count
  // never promises sections the list would not show. In the order sections
  // list their attributes.
  const attributes = useMemo(() => {
    const found = optionCounts(
      summaries,
      criteria,
      "unknownIn",
      unknownAttributesOf
    )
    const count = new Map(found.map((o) => [o.name, o.count]))
    return attributeNames(summaries).map((name) => ({
      name,
      count: count.get(name) ?? 0,
    }))
  }, [summaries, criteria])
  const span = useMemo(() => buildYearSpan(summaries), [summaries])
  const added = useMemo(() => addedSpan(summaries), [summaries])

  // Which groups show: on, or able to narrow what the switch shows.
  const show = {
    editions:
      !paused &&
      (s.firstSeenEditions.length > 0 ||
        canNarrow(editions, among("firstSeenEditions"))),
    tracers:
      !paused && (s.tracers.length > 0 || canNarrow(tracers, among("tracers"))),
    states:
      !paused && (s.states.length > 0 || canNarrow(states, among("states"))),
    length:
      !paused &&
      (s.lengthFrom !== null ||
        s.lengthTo !== null ||
        (lengths !== null && lengths[0] < lengths[1])),
    ends:
      !paused &&
      (s.proposedEnd.length > 0 || canNarrow(ends, among("proposedEnd"))),
    companies:
      s.companies.length > 0 || canNarrow(companies, among("companies")),
    diameters:
      s.diameters.length > 0 || canNarrow(diameters, among("diameters")),
    // A range narrows when the years differ, or some section has none.
    built:
      s.builtFrom !== null ||
      s.builtTo !== null ||
      (span !== null && rangeNarrows(summaries, buildYear)),
    added:
      s.addedFrom !== null ||
      s.addedTo !== null ||
      (added !== null && rangeNarrows(summaries, (x) => x.addedAt)),
    unknownIn:
      s.unknownIn.length > 0 || canNarrow(attributes, among("unknownIn")),
    needsDecision:
      s.needsDecisionOnly ||
      (counts.needsDecision > 0 && counts.needsDecision < matching),
    changed:
      s.changedOnly || canNarrow([{ count: changed }], among("changedOnly")),
  }

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
            {show.needsDecision && (
              <OptionRow
                control={
                  <Checkbox
                    checked={s.needsDecisionOnly}
                    onCheckedChange={(on) =>
                      s.setNeedsDecisionOnly(on === true)
                    }
                  />
                }
                label="Needs your decision"
                count={counts.needsDecision}
                selected={s.needsDecisionOnly}
              />
            )}
            {show.changed && (
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
            )}
          </div>
        </Group>

        {show.editions && (
          <Group
            title="First shown by"
            on={s.firstSeenEditions.length > 0}
            onClear={() => s.setFirstSeenEditions([])}
          >
            <MultiPick
              noun="editions"
              placeholder="Type to find an edition"
              options={editions}
              value={s.firstSeenEditions}
              onChange={s.setFirstSeenEditions}
              name={editionLabel}
            />
          </Group>
        )}

        {show.tracers && (
          <Group
            title="Traced by"
            on={s.tracers.length > 0}
            onClear={() => s.setTracers([])}
          >
            <MultiPick
              noun="tracers"
              placeholder="Type to find a tracer"
              options={tracers}
              value={s.tracers}
              onChange={s.setTracers}
              name={tracerName}
            />
          </Group>
        )}

        {show.states && (
          <Group
            title="State"
            on={s.states.length > 0}
            onClear={() => s.setStates([])}
          >
            <MultiPick
              noun="states"
              options={states}
              value={s.states}
              onChange={s.setStates}
            />
          </Group>
        )}

        {show.length && (
          <Group
            title="Length"
            on={s.lengthFrom !== null || s.lengthTo !== null}
            onClear={() => s.setLength(null, null)}
          >
            <div className="flex items-center gap-2">
              <Km
                label="Length from, km"
                placeholder={lengths ? String(lengths[0]) : "From"}
                value={s.lengthFrom}
                onChange={(km) => s.setLength(km, s.lengthTo)}
              />
              <span className="type-ui-sm text-muted-foreground">to</span>
              <Km
                label="Length to, km"
                placeholder={lengths ? String(lengths[1]) : "To"}
                value={s.lengthTo}
                onChange={(km) => s.setLength(s.lengthFrom, km)}
              />
              <span className="type-ui-sm text-muted-foreground">km</span>
            </div>
            {s.lengthFrom !== null &&
              s.lengthTo !== null &&
              s.lengthFrom > s.lengthTo && (
                <Hint role="status">
                  From is more than to, so no section can match.
                </Hint>
              )}
          </Group>
        )}

        {show.ends && (
          <Group
            title="Proposed end"
            on={s.proposedEnd.length > 0}
            onClear={() => s.setProposedEnd([])}
          >
            <CheckList
              label="Proposed end"
              options={ends}
              value={s.proposedEnd}
              onChange={(next) =>
                s.setProposedEnd(next as typeof s.proposedEnd)
              }
              name={(kind) =>
                PROPOSED_END_LABEL[kind as keyof typeof PROPOSED_END_LABEL]
              }
            />
          </Group>
        )}

        {show.companies && (
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
        )}

        {show.diameters && (
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
        )}

        {show.built && (
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
        )}

        {show.added && (
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
        )}

        {show.unknownIn && (
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
        )}
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
