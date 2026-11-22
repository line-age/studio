import { formatDateRange } from "@/components/date-range-picker"
import {
  formatCount,
  plural,
  PROPOSED_END_LABEL,
  type SectionCriteria,
} from "@/data/derive"
import { STATUS_LABEL } from "@/data/status"

import type { StudioState } from "./studio-store"

/*
 * Every filter behind the filter button, once each, in the order its chip is
 * listed. One entry says all the list and the store need of a filter: when it
 * is on, what turns it off, its chip, and what it asks of a section. The
 * store's "filters on" and "clear all", the chips and the criteria the list,
 * the map and the counts read are all worked out from here.
 *
 * Adding a filter: its fields and setter in the store, its words in the link
 * (`url-state.ts`), an entry here, and its control in the Filters panel.
 */

/** The parts of the screen's state the filters are made of. */
export type FilterState = Pick<
  StudioState,
  | "scope"
  | "status"
  | "needsDecisionOnly"
  | "changedOnly"
  | "unknownIn"
  | "companies"
  | "builtFrom"
  | "builtTo"
  | "addedFrom"
  | "addedTo"
  | "firstSeenEditions"
  | "tracers"
  | "states"
  | "lengthFrom"
  | "lengthTo"
  | "proposedEnd"
  | "diameters"
>

/** What a chip needs to name things the state holds by id. */
export interface FilterWords {
  editionLabel: (editionId: string) => string
  /** A tracer's name; never written anywhere but the screen. */
  tracerName: (agentId: string) => string
}

export interface Filter {
  /** A name to tell filters apart by; never shown. */
  key: string
  /**
   * About a section on its own (which edition first shows it, who traced it,
   * where it runs, how long it is, what end is proposed for it): offered on
   * All and on Unplaced only. On Pipelines it is kept, asks for nothing and
   * has no chip, until the switch goes back.
   */
  aboutSection: boolean
  isOn: (s: FilterState) => boolean
  /** The state that turns it off. */
  off: Partial<FilterState>
  /** Its chip: the label, and what it does, in words. */
  chip: (s: FilterState, words: FilterWords) => { label: string; hint: string }
  /** What it asks of a section, as the list, the map and the counts read it. */
  criteria: (s: FilterState) => Partial<SectionCriteria>
}

const range = <T>(from: T | null, to: T | null) => from !== null || to !== null

export const FILTERS: readonly Filter[] = [
  {
    key: "status",
    aboutSection: false,
    isOn: (s) => s.status !== "all",
    off: { status: "all" },
    chip: (s) => {
      const label = s.status === "all" ? "" : STATUS_LABEL[s.status]
      return {
        label,
        hint: `Only sections that are ${label.toLocaleLowerCase()}.`,
      }
    },
    criteria: (s) => ({ status: s.status }),
  },
  {
    key: "needs-decision",
    aboutSection: false,
    isOn: (s) => s.needsDecisionOnly,
    off: { needsDecisionOnly: false },
    chip: () => ({
      label: "Needs your decision",
      hint: "Only sections with a proposal waiting for a person.",
    }),
    criteria: (s) => ({ needsDecision: s.needsDecisionOnly }),
  },
  {
    key: "unknown-in",
    aboutSection: false,
    isOn: (s) => s.unknownIn.length > 0,
    off: { unknownIn: [] },
    chip: (s) => ({
      label: `Unknown ${s.unknownIn.join(", ").toLocaleLowerCase()}`,
      hint: "Only what has a section where one of these claims is Unknown.",
    }),
    criteria: (s) => ({ unknownIn: s.unknownIn }),
  },
  {
    key: "companies",
    aboutSection: false,
    isOn: (s) => s.companies.length > 0,
    off: { companies: [] },
    chip: (s) => ({
      label:
        s.companies.length === 1
          ? s.companies[0]
          : plural(s.companies.length, "company", "companies"),
      hint: `Only what has a section owned by ${s.companies.join(", ")}.`,
    }),
    criteria: (s) => ({ companies: s.companies }),
  },
  {
    key: "built",
    aboutSection: false,
    isOn: (s) => range(s.builtFrom, s.builtTo),
    off: { builtFrom: null, builtTo: null },
    chip: (s) => ({
      label:
        s.builtFrom !== null && s.builtTo !== null
          ? `Built ${s.builtFrom} to ${s.builtTo}`
          : s.builtFrom !== null
            ? `Built ${s.builtFrom} or later`
            : `Built ${s.builtTo} or earlier`,
      hint: "Only what has a section built in these years. Sections with an Unknown build date are left out.",
    }),
    criteria: (s) => ({ builtFrom: s.builtFrom, builtTo: s.builtTo }),
  },
  {
    key: "added",
    aboutSection: false,
    isOn: (s) => range(s.addedFrom, s.addedTo),
    off: { addedFrom: null, addedTo: null },
    chip: (s) => ({
      label: `Added: ${formatDateRange(s.addedFrom, s.addedTo)}`,
      hint: "Only what has a section added to Lineage on these days.",
    }),
    criteria: (s) => ({ addedFrom: s.addedFrom, addedTo: s.addedTo }),
  },
  {
    key: "changed",
    aboutSection: false,
    isOn: (s) => s.changedOnly,
    off: { changedOnly: false },
    chip: () => ({
      label: "Changed since review",
      hint: "Only sections changed since a person last reviewed them.",
    }),
    criteria: (s) => ({ changedOnly: s.changedOnly }),
  },
  {
    key: "first-shown-by",
    aboutSection: true,
    isOn: (s) => s.firstSeenEditions.length > 0,
    off: { firstSeenEditions: [] },
    chip: (s, words) => {
      const labels = s.firstSeenEditions.map(words.editionLabel)
      return {
        label:
          labels.length === 1
            ? `First shown by the ${labels[0]}`
            : `First shown by ${plural(labels.length, "edition")}`,
        hint: `Only sections first shown by the ${labels.join(", the ")}.`,
      }
    },
    criteria: (s) => ({ firstSeenEditions: s.firstSeenEditions }),
  },
  {
    key: "traced-by",
    aboutSection: true,
    isOn: (s) => s.tracers.length > 0,
    off: { tracers: [] },
    chip: (s, words) => {
      const named = s.tracers.map(words.tracerName)
      return {
        label:
          named.length === 1
            ? `Traced by ${named[0]}`
            : `Traced by ${plural(named.length, "person", "people")}`,
        hint: `Only sections traced by ${named.join(", ")}.`,
      }
    },
    criteria: (s) => ({ tracers: s.tracers }),
  },
  {
    key: "states",
    aboutSection: true,
    isOn: (s) => s.states.length > 0,
    off: { states: [] },
    chip: (s) => ({
      label:
        s.states.length === 1 ? s.states[0] : plural(s.states.length, "state"),
      hint: `Only sections that run through ${s.states.join(", ")}.`,
    }),
    criteria: (s) => ({ states: s.states }),
  },
  {
    key: "length",
    aboutSection: true,
    isOn: (s) => range(s.lengthFrom, s.lengthTo),
    off: { lengthFrom: null, lengthTo: null },
    chip: (s) => ({
      label:
        s.lengthFrom !== null && s.lengthTo !== null
          ? `${formatCount(s.lengthFrom)} to ${formatCount(s.lengthTo)} km`
          : s.lengthFrom !== null
            ? `${formatCount(s.lengthFrom)} km or longer`
            : `${formatCount(s.lengthTo ?? 0)} km or shorter`,
      hint: "Only sections whose line is this long, measured along the route as traced.",
    }),
    criteria: (s) => ({ lengthFrom: s.lengthFrom, lengthTo: s.lengthTo }),
  },
  {
    key: "proposed-end",
    aboutSection: true,
    isOn: (s) => s.proposedEnd.length > 0,
    off: { proposedEnd: [] },
    chip: (s) => ({
      label: `Proposed end: ${s.proposedEnd
        .map((kind) => PROPOSED_END_LABEL[kind].toLocaleLowerCase())
        .join(" or ")}`,
      hint: "Only sections a tool proposes an end for.",
    }),
    criteria: (s) => ({ proposedEnd: s.proposedEnd }),
  },
  {
    key: "diameters",
    aboutSection: false,
    isOn: (s) => s.diameters.length > 0,
    off: { diameters: [] },
    chip: (s) => ({
      label: `Diameter ${s.diameters.join(", ")}`,
      hint: "Only sections with one of these cited diameters. Unknown is left out.",
    }),
    criteria: (s) => ({ diameters: s.diameters }),
  },
]

/** On Pipelines the filters about a section on its own ask for nothing. */
export const sectionFiltersPaused = (s: Pick<FilterState, "scope">) =>
  s.scope === "pipelines"

/** Whether a filter asks something of the list now: on, and not paused. */
export const inForce = (filter: Filter, s: FilterState) =>
  filter.isOn(s) && !(filter.aboutSection && sectionFiltersPaused(s))

/** The filters in force, in chip order. */
export const filtersInForce = (s: FilterState) =>
  FILTERS.filter((filter) => inForce(filter, s))

/** Every filter off: what "Clear all" behind the filter button sets. */
export const ALL_OFF: Partial<FilterState> = Object.assign(
  {},
  ...FILTERS.map((filter) => filter.off)
)

/**
 * What the filters ask of a section, a paused one asking nothing. The rest of
 * the criteria (the rule, the lookups) the caller adds.
 */
export function filterCriteria(s: FilterState): Partial<SectionCriteria> {
  return Object.assign(
    {},
    ...FILTERS.map((filter) =>
      filter.aboutSection && sectionFiltersPaused(s) ? {} : filter.criteria(s)
    )
  )
}

/** The fields of the state the filters read, for a shallow selector. */
export function filterState(s: FilterState): FilterState {
  return {
    scope: s.scope,
    status: s.status,
    needsDecisionOnly: s.needsDecisionOnly,
    changedOnly: s.changedOnly,
    unknownIn: s.unknownIn,
    companies: s.companies,
    builtFrom: s.builtFrom,
    builtTo: s.builtTo,
    addedFrom: s.addedFrom,
    addedTo: s.addedTo,
    firstSeenEditions: s.firstSeenEditions,
    tracers: s.tracers,
    states: s.states,
    lengthFrom: s.lengthFrom,
    lengthTo: s.lengthTo,
    proposedEnd: s.proposedEnd,
    diameters: s.diameters,
  }
}
