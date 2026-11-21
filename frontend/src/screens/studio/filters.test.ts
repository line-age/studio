import { describe, expect, it } from "vitest"

import { NO_CRITERIA } from "@/data/derive"

import {
  ALL_OFF,
  FILTERS,
  filterCriteria,
  filtersInForce,
  type FilterState,
} from "./filters"
import { useStudio } from "./studio-store"

const off = (): FilterState => ({
  ...useStudio.getInitialState(),
  scope: "all",
})

/** Every filter turned on, each in a way its chip can name. */
const allOn: Partial<FilterState> = {
  status: "done",
  needsDecisionOnly: true,
  changedOnly: true,
  unknownIn: ["Diameter"],
  companies: ["Invented Gas Co."],
  builtFrom: 1930,
  addedTo: "2026-10-31",
  firstSeenEditions: ["ed-1931"],
  tracers: ["agent-1"],
  states: ["Georgia"],
  lengthFrom: 5,
  proposedEnd: ["cut"],
  diameters: ["6 in"],
}

describe("the filter table", () => {
  it("has one entry per filter, each with its own key", () => {
    const keys = FILTERS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("sees every filter off on a fresh screen", () => {
    expect(filtersInForce(off())).toEqual([])
  })

  it("turns each filter off with its own state, touching no other", () => {
    const on = { ...off(), ...allOn }
    for (const filter of FILTERS) {
      expect(filter.isOn(on)).toBe(true)
      const after = { ...on, ...filter.off }
      expect(filter.isOn(after)).toBe(false)
      // The others stay on.
      expect(filtersInForce(after)).toHaveLength(FILTERS.length - 1)
    }
    expect(filtersInForce({ ...on, ...ALL_OFF })).toEqual([])
  })

  it("pauses the filters about a section on Pipelines, and only those", () => {
    const on = { ...off(), ...allOn, scope: "pipelines" as const }
    const paused = FILTERS.filter((f) => f.aboutSection).map((f) => f.key)
    expect(paused).toEqual([
      "first-shown-by",
      "traced-by",
      "states",
      "length",
      "proposed-end",
    ])
    expect(filtersInForce(on).map((f) => f.key)).not.toContain("length")
    // A paused filter asks nothing of a section.
    const criteria = { ...NO_CRITERIA, ...filterCriteria(on) }
    expect(criteria.lengthFrom).toBeNull()
    expect(criteria.tracers).toEqual([])
    expect(criteria.diameters).toEqual(["6 in"])
  })

  it("asks of a section what the state says, every criterion covered", () => {
    const criteria = filterCriteria({ ...off(), ...allOn })
    const fromTable = Object.keys(criteria).sort()
    const lookups = ["rule", "owners", "editionYears", "statesOf"]
    expect(fromTable).toEqual(
      Object.keys(NO_CRITERIA)
        .filter((k) => !lookups.includes(k))
        .sort()
    )
  })
})
