import { useShallow } from "zustand/react/shallow"

import { DateRangePicker } from "@/components/date-range-picker"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { YearPicker } from "@/components/year-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  formatCount,
  isProposedEndKind,
  plural,
  PROPOSED_END_LABEL,
  SCOPE,
} from "@/data/derive"
import { isSectionStatus, STATUSES, STATUS_LABEL } from "@/data/status"

import { HidePanels } from "../panel-toggle"
import { filtersApplied, useStudio } from "../studio-store"
import { filtersInForce } from "../filters"
import { CheckList, Group, Km, MultiPick, OptionRow } from "./filter-controls"
import { useFilterOptions } from "./filter-options"

/*
 * The second level of the list panel: every filter on one screen, in place
 * of the list, with the way back and a live count (the owner, 2026-11-13).
 * A group shows while it is on, or while it can narrow what the switch
 * shows: one of its choices would leave some sections and not all of them
 * (the owner, 2026-11-21). A filter with nothing to tell apart, as on data
 * that has no diameters yet, is left out and comes back by itself. Status
 * always shows. The filters about a section on its own (first shown by,
 * traced by, state, length, proposed end) are offered on All and on Unplaced only. The
 * counts beside options are sections the switch shows with the other filters
 * on: what choosing that option would show.
 */

/** More options than this and a list of boxes becomes a search with chips. */
const LONG_LIST = 8

/** Build years can be picked up to the present, whatever the data holds. */
const THIS_YEAR = new Date().getFullYear()

/**
 * The filters, shown in place of the list in the same panel so the map stays
 * in sight while they are set. `onBack` returns to the list.
 */
/** The id of what says a length range runs backwards. */
const BACKWARDS_ID = "filter-length-backwards"

export function FiltersPanel({ onBack }: { onBack: () => void }) {
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
  const scope = useStudio((x) => x.scope)
  // The filters in force on this tab, as the chips under the search count them.
  const onCount = useStudio((x) => filtersInForce(x).length)

  const {
    counts,
    matching,
    editions,
    editionLabel,
    tracers,
    tracerName,
    ends,
    lengths,
    changed,
    states,
    companies,
    diameters,
    attributes,
    span,
    added,
    show,
  } = useFilterOptions()
  // A range from more than to: no section can match, and the boxes say so.
  const backwards =
    s.lengthFrom !== null && s.lengthTo !== null && s.lengthFrom > s.lengthTo

  return (
    <>
      <PanelHeader
        // Which tab it filters, and how many are on (Figma `406:15648`).
        title={`Filters · ${SCOPE[scope].label}`}
        meta={onCount === 0 ? "None on" : `${formatCount(onCount)} on`}
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
              onValueChange={(value) => {
                if (value === "all" || isSectionStatus(value))
                  s.setStatus(value)
              }}
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
              placeholder="Type to find an edition…"
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
              placeholder="Type to find a tracer…"
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
                name="length-from"
                placeholder={lengths ? String(lengths[0]) : "From"}
                value={s.lengthFrom}
                onChange={(km) => s.setLength(km, s.lengthTo)}
                invalid={backwards}
                describedBy={backwards ? BACKWARDS_ID : undefined}
              />
              <span className="type-ui-sm text-muted-foreground">to</span>
              <Km
                label="Length to, km"
                name="length-to"
                placeholder={lengths ? String(lengths[1]) : "To"}
                value={s.lengthTo}
                onChange={(km) => s.setLength(s.lengthFrom, km)}
                invalid={backwards}
                describedBy={backwards ? BACKWARDS_ID : undefined}
              />
              <span className="type-ui-sm text-muted-foreground">km</span>
            </div>
            {backwards && (
              <Hint id={BACKWARDS_ID} role="status">
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
                s.setProposedEnd(next.filter(isProposedEndKind))
              }
              name={(kind) =>
                isProposedEndKind(kind) ? PROPOSED_END_LABEL[kind] : kind
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
