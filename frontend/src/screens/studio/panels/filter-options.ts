import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import {
  addedSpan,
  attributeNames,
  buildYear,
  buildYearSpan,
  canNarrow,
  companiesOf,
  diameterOf,
  filterCounts,
  firstSeenEditionId,
  lengthKm,
  optionCounts,
  passingWithout,
  proposedEndKinds,
  PROPOSED_ENDS,
  rangeNarrows,
  tracerNames,
  tracerOf,
  unknownAttributesOf,
} from "@/data/derive"

import { filterState, sectionFiltersPaused } from "../filters"
import { useCriteria, useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * What the Filters panel offers: each group's options with their counts, and
 * which groups show. Counted over what the switch shows, after every filter
 * but the group's own, and never following the map.
 */
export function useFilterOptions() {
  const {
    scoped: summaries,
    owners,
    network,
    statesOf,
    editionYears,
  } = useStudioData()
  const criteria = useCriteria()
  const s = useStudio(useShallow(filterState))
  // On Pipelines the filters about a section on its own are not offered.
  const paused = sectionFiltersPaused(s)

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

  return {
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
  }
}
