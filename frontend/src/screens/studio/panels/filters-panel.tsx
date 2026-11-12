import { useId, useMemo } from "react"

import { DateRangePicker } from "@/components/date-range-picker"
import { GroupLabel } from "@/components/group-label"
import { LayerRow } from "@/components/layer-row"
import { LegendItem } from "@/components/legend-item"
import { LineKey } from "@/components/line-key"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { SwitchRow } from "@/components/switch-row"
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
  addedSpan,
  attributeNames,
  buildYearSpan,
  companyCounts,
  formatCount,
  matchesUnknownIn,
  plural,
  showCounts,
  type ShowFilter,
} from "@/data/derive"
import { cn } from "@/lib/utils"

import { LeftPanelToggle } from "../panel-toggle"
import { useStudioData, useVisiblePipelines } from "../studio-data"
import { filtersApplied, useStudio } from "../studio-store"

const showOptions: { value: ShowFilter; label: string }[] = [
  { value: "all", label: "All pipelines" },
  { value: "unknown", label: "With Unknown facts" },
  { value: "proposals", label: "With proposals waiting" },
  { value: "changed", label: "Changed since last review" },
]

function Group({
  title,
  action,
  children,
}: {
  title: string
  /** A small control on the right of the title, such as Clear. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b p-3">
      <div className="flex items-center justify-between gap-2">
        <GroupLabel id={id}>{title}</GroupLabel>
        {action}
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

export function FiltersPanel() {
  const { network, edition, summaries } = useStudioData()
  const visible = useVisiblePipelines()
  const layers = useStudio((s) => s.layers)
  const toggleLayer = useStudio((s) => s.toggleLayer)
  const show = useStudio((s) => s.show)
  const setShow = useStudio((s) => s.setShow)
  const onlyInView = useStudio((s) => s.onlyInView)
  const setOnlyInView = useStudio((s) => s.setOnlyInView)
  const clearFilters = useStudio((s) => s.clearFilters)
  const unknownIn = useStudio((s) => s.unknownIn)
  const toggleUnknownIn = useStudio((s) => s.toggleUnknownIn)
  const companies = useStudio((s) => s.companies)
  const setCompanies = useStudio((s) => s.setCompanies)
  const builtFrom = useStudio((s) => s.builtFrom)
  const builtTo = useStudio((s) => s.builtTo)
  const setBuilt = useStudio((s) => s.setBuilt)
  const addedFrom = useStudio((s) => s.addedFrom)
  const addedTo = useStudio((s) => s.addedTo)
  const setAdded = useStudio((s) => s.setAdded)
  const filtered = useStudio(filtersApplied)

  const counts = useMemo(() => showCounts(summaries), [summaries])
  // Only notes on sections of this edition are drawn, so only those count.
  const noteCount = useMemo(() => {
    const inEdition = new Set(
      summaries.flatMap((s) => s.sections.map((section) => section.id))
    )
    return network.notes.filter((note) => inEdition.has(note.sectionId)).length
  }, [network.notes, summaries])
  const otherYears = network.editions
    .filter((e) => e.id !== edition.id)
    .map((e) => e.year)
    .sort()
  const proposed = network.proposedPaths.filter((p) =>
    p.editionIds.includes(edition.id)
  ).length
  // Per attribute: how many pipelines have a section where it is Unknown.
  const attributes = useMemo(
    () =>
      attributeNames(summaries).map((name) => ({
        name,
        count: summaries.filter((s) => matchesUnknownIn(s, [name])).length,
      })),
    [summaries]
  )
  const allCompanies = useMemo(() => companyCounts(summaries), [summaries])
  const span = useMemo(() => buildYearSpan(summaries), [summaries])
  const added = useMemo(() => addedSpan(summaries), [summaries])
  const companyNames = useMemo(
    () => allCompanies.map((c) => c.name),
    [allCompanies]
  )
  const companyCount = useMemo(
    () => new Map(allCompanies.map((c) => [c.name, c.count])),
    [allCompanies]
  )
  const companyAnchor = useComboboxAnchor()

  return (
    <>
      <PanelHeader title="Filters" divider>
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear all
          </Button>
        )}
        <LeftPanelToggle />
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <Group title="Show on the map">
          <ul className="flex flex-col gap-0.5">
            <LayerRow
              name="Pipelines"
              meta={`${edition.year} · ${formatCount(visible.length)} ${onlyInView ? "in view" : "shown"}`}
              lineKey={<LineKey kind="solid" />}
              visible={layers.pipelines}
              onVisibleChange={() => toggleLayer("pipelines")}
            />
            <LayerRow
              name="Proposed paths"
              meta={`${formatCount(proposed)} waiting`}
              lineKey={<LineKey kind="dashed" />}
              visible={layers.proposed}
              onVisibleChange={() => toggleLayer("proposed")}
            />
            <LayerRow
              name="Other editions"
              meta={
                otherYears.length > 0
                  ? `${otherYears.join(", ")} as ghost`
                  : "No other edition"
              }
              lineKey={<LineKey kind="ghost" />}
              visible={layers.ghost}
              onVisibleChange={() => toggleLayer("ghost")}
            />
            <LayerRow
              name="Note pins"
              meta={plural(noteCount, "note")}
              visible={layers.pins}
              onVisibleChange={() => toggleLayer("pins")}
            />
          </ul>
        </Group>

        <Group title="Show">
          <RadioGroup
            aria-label="Show"
            value={show}
            onValueChange={(value) => setShow(value as ShowFilter)}
            className="gap-0.5"
          >
            {showOptions.map((option) => (
              <OptionRow
                key={option.value}
                control={<RadioGroupItem value={option.value} />}
                label={option.label}
                count={counts[option.value]}
                selected={show === option.value}
              />
            ))}
          </RadioGroup>
        </Group>

        {allCompanies.length > 0 && (
          <Group
            title="Company"
            action={
              companies.length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCompanies([])}
                >
                  Clear
                </Button>
              )
            }
          >
            {/* Type to find a company; the chosen ones stay as chips. */}
            <Combobox
              multiple
              autoHighlight
              limit={50}
              items={companyNames}
              value={companies as string[]}
              onValueChange={(next) => setCompanies(next)}
            >
              <ComboboxChips ref={companyAnchor} className="w-full">
                <ComboboxValue>
                  {(chosen: string[]) => (
                    <>
                      {chosen.map((name) => (
                        <ComboboxChip key={name} aria-label={name}>
                          <span className="max-w-44 truncate">{name}</span>
                        </ComboboxChip>
                      ))}
                      <ComboboxChipsInput
                        aria-label="Search companies"
                        placeholder={
                          chosen.length === 0 ? "Search companies" : ""
                        }
                      />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
              <ComboboxContent anchor={companyAnchor}>
                <ComboboxEmpty>No company matches.</ComboboxEmpty>
                <ComboboxList>
                  {(name: string) => (
                    <ComboboxItem key={name} value={name}>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="type-ui-mono-xs text-muted-foreground">
                        {formatCount(companyCount.get(name) ?? 0)}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Group>
        )}

        {span && (
          <Group
            title="Build date"
            action={
              (builtFrom !== null || builtTo !== null) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setBuilt(null, null)}
                >
                  Clear
                </Button>
              )
            }
          >
            <div className="flex items-center gap-2">
              <YearPicker
                label="Built from year"
                value={builtFrom}
                onChange={(year) => setBuilt(year, builtTo)}
                min={span[0]}
                max={builtTo ?? span[1]}
                first={span[0]}
                placeholder="From"
              />
              <span className="type-ui-sm text-muted-foreground">to</span>
              <YearPicker
                label="Built to year"
                value={builtTo}
                onChange={(year) => setBuilt(builtFrom, year)}
                min={builtFrom ?? span[0]}
                first={span[0]}
                max={span[1]}
                placeholder="To"
              />
            </div>
          </Group>
        )}

        {added && (
          <Group
            title="Added to Lineage"
            action={
              (addedFrom !== null || addedTo !== null) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setAdded(null, null)}
                >
                  Clear
                </Button>
              )
            }
          >
            <DateRangePicker
              label="Added to Lineage"
              from={addedFrom}
              to={addedTo}
              onChange={setAdded}
              min={added[0]}
              max={added[1]}
            />
          </Group>
        )}

        {attributes.length > 0 && (
          <Group
            title="Unknown in"
            action={
              unknownIn.length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => unknownIn.forEach(toggleUnknownIn)}
                >
                  Clear
                </Button>
              )
            }
          >
            <div
              role="group"
              aria-label="Unknown in"
              className="flex flex-col gap-0.5"
            >
              {attributes.map(({ name, count }) => (
                <OptionRow
                  key={name}
                  control={
                    <Checkbox
                      checked={unknownIn.includes(name)}
                      onCheckedChange={() => toggleUnknownIn(name)}
                    />
                  }
                  label={name}
                  count={count}
                  selected={unknownIn.includes(name)}
                />
              ))}
            </div>
          </Group>
        )}

        <Group title="Area">
          <SwitchRow
            label="Only what's in the map view"
            description="The list follows the map as you pan and zoom."
            checked={onlyInView}
            onCheckedChange={setOnlyInView}
          />
        </Group>

        <Group title="How sections are drawn">
          <ul className="flex flex-col gap-2">
            <LegendItem kind="solid">Solid: every fact is cited</LegendItem>
            <LegendItem kind="dotted">
              Dotted: at least one fact is Unknown
            </LegendItem>
          </ul>
        </Group>
      </div>

      <PanelFooter>
        <span aria-live="polite">
          {formatCount(visible.length)} of{" "}
          {plural(summaries.length, "pipeline")} shown
        </span>
      </PanelFooter>
    </>
  )
}
