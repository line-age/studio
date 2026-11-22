import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { FilterChip } from "@/components/filter-chip"
import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { tracerNames, type Scope } from "@/data/derive"

import { filterState, filtersInForce, type FilterWords } from "../filters"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * What a search widened past the filters looks through. It stays inside what
 * the switch shows (the owner, 2026-11-21), so it says that and never "the
 * whole network" where it is not.
 */
export const SEARCH_PAST: Record<Scope, { chip: string; all: string }> = {
  all: { chip: "Whole network", all: "the whole network" },
  pipelines: { chip: "Every pipeline", all: "every pipeline" },
  unplaced: {
    chip: "Every unplaced section",
    all: "every unplaced section",
  },
}

/** One filter in force, as a chip. */
export interface Chip {
  /** What the chip says: "Texas", "50 km or longer". */
  label: string
  /** What the filter does, in a sentence, on hover. */
  hint: string
  /** Its ×: take this filter off. */
  remove: () => void
}

/**
 * The filters in force, each with the way to take it off, from the table in
 * ../filters. A search widened past the filters is one chip in their place:
 * it looks through everything the switch shows.
 */
export function useFilterChips(widened: boolean): Chip[] {
  const { scope, network } = useStudioData()
  const parts = useStudio(useShallow(filterState))
  const takeOff = useStudio((s) => s.takeOff)
  const setWhole = useStudio((s) => s.setSearchPastFilters)
  // The words a chip needs for what the state holds by id.
  const words = useMemo<FilterWords>(() => {
    const editions = new Map(network.editions.map((e) => [e.id, e.label]))
    const tracers = tracerNames(network.sections)
    return {
      editionLabel: (id) => editions.get(id) ?? id,
      tracerName: (id) => tracers.get(id) ?? "someone",
    }
  }, [network])
  if (widened) {
    return [
      {
        label: SEARCH_PAST[scope].chip,
        hint: `The search looks through ${SEARCH_PAST[scope].all}, not only what the filters leave.`,
        remove: () => setWhole(false),
      },
    ]
  }
  return filtersInForce(parts).map((filter) => ({
    ...filter.chip(parts, words),
    remove: () => takeOff(filter.key),
  }))
}

/** The chips under the search, and Clear all where there are several. */
export function FilterChips({
  chips,
}: {
  /** The filters in force, in the order the table lists them. */
  chips: readonly Chip[]
}) {
  if (chips.length === 0) return null
  return (
    <div
      role="group"
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Filters in force"
    >
      {/* Says what the row is: stock shadcn Tooltip (owner, 2026-11-12). */}
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className="flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <Icon name="filter" className="size-3.5 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          Filters applied to this list
        </TooltipContent>
      </Tooltip>
      {chips.map((chip) => (
        <FilterChip
          key={chip.label}
          hint={chip.hint}
          removeLabel={`Remove the filter: ${chip.label}`}
          onRemove={chip.remove}
        >
          {chip.label}
        </FilterChip>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => chips.forEach((chip) => chip.remove())}
        >
          Clear all
        </Button>
      )}
    </div>
  )
}
