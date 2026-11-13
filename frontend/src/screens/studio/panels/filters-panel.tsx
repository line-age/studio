import { useId, useMemo } from "react"

import { DateRangePicker } from "@/components/date-range-picker"
import { GroupLabel } from "@/components/group-label"
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
import {
  addedSpan,
  buildYearSpan,
  companyCounts,
  filterCounts,
  formatCount,
  unknownCounts,
  plural,
} from "@/data/derive"
import { cn } from "@/lib/utils"

import { HidePanels } from "../panel-toggle"
import { useCriteria, useStudioData } from "../studio-data"
import { filtersApplied, useStudio } from "../studio-store"

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

/** Build years can be picked up to the present, whatever the data holds. */
const THIS_YEAR = new Date().getFullYear()

/**
 * The filters, shown in place of the list in the same panel so the map stays
 * in sight while they are set. `onBack` returns to the list.
 */
export function FiltersPanel({ onBack }: { onBack: () => void }) {
  const { summaries } = useStudioData()
  const criteria = useCriteria()
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

  // The sections of the edition the filters leave, as the status counts
  // count them: the map view does not change it.
  const matching = useMemo(() => {
    const counts = filterCounts(summaries, criteria)
    return criteria.status === "all"
      ? counts.all
      : counts.status[criteria.status]
  }, [summaries, criteria])
  // Per attribute: how many sections have it Unknown.
  const attributes = useMemo(
    () =>
      [...unknownCounts(summaries)].map(([name, count]) => ({ name, count })),
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
                max={builtTo ?? THIS_YEAR}
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
                max={THIS_YEAR}
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
      </div>

      <PanelFooter className="justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!filtered}
          onClick={clearFilters}
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
