import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import {
  companiesOf,
  diameterOf,
  canNarrow,
  editionRows,
  firstSeenEditionId,
  lengthKm,
  passingWithout,
  proposedEndKinds,
  rangeNarrows,
  tracerNames,
  tracerOf,
  narrowRows,
  NO_CRITERIA,
  optionCounts,
  sectionMatches,
  summarise,
  type SectionCriteria,
} from "./derive"
import { withClaims, type Section } from "./schema"

/*
 * The filters about a section: the edition that first shows it, changed
 * since review, its cited diameter, the states it runs through, how long its
 * line is and the end a tool proposes for it; and whether a filter has
 * anything to tell apart.
 */

const network = testNetwork()
const section = (id: string) => network.sections.find((s) => s.id === id)!
const editionYears = new Map(network.editions.map((e) => [e.id, e.year]))
const passing = (criteria: Partial<SectionCriteria>) =>
  network.sections
    .filter((s) =>
      sectionMatches(s, { ...NO_CRITERIA, editionYears, ...criteria })
    )
    .map((s) => s.id)

describe("the new filters", () => {
  it("keeps the sections one of the chosen editions is the first to show", () => {
    // s-1 is on the 1931 map as well as 1937: first shown by 1931.
    expect(firstSeenEditionId(section("s-1"), editionYears)).toBe("ed-1931")
    expect(passing({ firstSeenEditions: ["ed-1937"] })).toEqual([
      "s-2",
      "s-3",
      "s-4",
    ])
    expect(passing({ firstSeenEditions: ["ed-1931"] })).toEqual(["s-1", "s-5"])
    expect(passing({ firstSeenEditions: ["ed-1931", "ed-1937"] })).toEqual([
      "s-1",
      "s-2",
      "s-3",
      "s-4",
      "s-5",
    ])
  })

  it("puts a section under the same edition as the list when two share a year", () => {
    // The network lists A before B, both 1947; the section names B first.
    const years = new Map([
      ["ed-a", 1947],
      ["ed-b", 1947],
    ])
    const twice = { ...section("s-1"), editionIds: ["ed-b", "ed-a"] }
    expect(firstSeenEditionId(twice, years)).toBe("ed-a")
  })

  it("measures a section along its line, in km", () => {
    // One degree of longitude at 10 degrees north is about 109.5 km.
    expect(lengthKm(section("s-1"))).toBeCloseTo(109.5, 0)
    // Every part of a line drawn in parts counts.
    const parts = {
      geometry: {
        type: "MultiLineString" as const,
        coordinates: [
          section("s-1").geometry.coordinates as [number, number][],
          section("s-1").geometry.coordinates as [number, number][],
        ],
      },
    }
    expect(lengthKm(parts)).toBeCloseTo(2 * lengthKm(section("s-1")), 6)
  })

  it("keeps the sections of a length, ends included", () => {
    const km = Object.fromEntries(
      network.sections.map((s) => [s.id, lengthKm(s)])
    )
    const longest = Math.max(...Object.values(km))
    expect(passing({ lengthFrom: longest })).toEqual(
      network.sections.filter((s) => km[s.id] === longest).map((s) => s.id)
    )
    expect(passing({ lengthTo: longest })).toHaveLength(network.sections.length)
    expect(passing({ lengthFrom: longest + 1 })).toEqual([])
  })

  it("keeps the sections with a proposed end, whole or part", () => {
    const ended: Section = {
      ...section("s-4"),
      proposedEnds: [
        {
          id: "pe-a",
          kind: "cut",
          otherSectionId: "gone-a",
          score: 0.5,
          citations: [],
        },
        {
          id: "pe-b",
          kind: "cut",
          otherSectionId: "gone-b",
          score: 0.4,
          citations: [],
        },
      ],
    }
    // Two cuts are one kind, said once.
    expect(proposedEndKinds(ended)).toEqual(["cut"])
    expect(proposedEndKinds(section("s-1"))).toEqual([])
    const matches = (kinds: SectionCriteria["proposedEnd"]) =>
      sectionMatches(ended, { ...NO_CRITERIA, proposedEnd: kinds })
    expect(matches(["cut"])).toBe(true)
    expect(matches(["end"])).toBe(false)
    expect(matches(["end", "cut"])).toBe(true)
    expect(passing({ proposedEnd: ["end", "cut"] })).toEqual([])
  })

  it("keeps the sections a person traced, by id", () => {
    const ann = { id: "agent-ann", name: "Ann Example" }
    const bob = { id: "agent-bob", name: "Bob Example" }
    const traced = network.sections.map((s, i) =>
      i === 4 ? s : { ...s, tracedBy: i % 2 === 0 ? ann : bob }
    )
    const by = (tracers: string[]) =>
      traced
        .filter((s) => sectionMatches(s, { ...NO_CRITERIA, tracers }))
        .map((s) => s.id)
    expect(by(["agent-ann"])).toEqual(["s-1", "s-3"])
    expect(by(["agent-ann", "agent-bob"])).toEqual(["s-1", "s-2", "s-3", "s-4"])
    // A section nobody is named for was traced by none of them.
    expect(tracerOf(traced[4])).toEqual([])
    expect([...tracerNames(traced)]).toEqual([
      ["agent-ann", "Ann Example"],
      ["agent-bob", "Bob Example"],
    ])
  })

  it("says whether a filter has anything to tell apart", () => {
    // Some and not all: it narrows.
    expect(canNarrow([{ count: 2 }, { count: 0 }], 5)).toBe(true)
    // Every choice at none or at everything: it does not.
    expect(canNarrow([{ count: 5 }, { count: 0 }], 5)).toBe(false)
    expect(canNarrow([], 5)).toBe(false)
    const editions = editionRows(network, NO_CRITERIA.rule)
    expect(
      passingWithout(
        editions,
        {
          ...NO_CRITERIA,
          editionYears,
          changedOnly: true,
          diameters: ["6 in"],
        },
        "diameters"
      )
    ).toBe(1)
    // A range narrows when two sections differ, or one has no value.
    expect(rangeNarrows(editions, () => 1930)).toBe(false)
    expect(rangeNarrows(editions, (x) => (x.id === "s-1" ? 1930 : null))).toBe(
      true
    )
  })

  it("keeps the sections changed since review", () => {
    expect(passing({ changedOnly: true })).toEqual(["s-2"])
  })

  it("keeps a cited diameter, never an Unknown one", () => {
    expect(passing({ diameters: ["6 in"] })).toEqual(["s-3"])
    expect(diameterOf(section("s-4"))).toEqual([])
  })

  it("keeps the sections that run through a state", () => {
    const statesOf = new Map([
      ["s-1", ["Georgia"]],
      ["s-3", ["Alabama", "Georgia"]],
    ])
    expect(passing({ states: ["Alabama"], statesOf })).toEqual(["s-3"])
    expect(passing({ states: ["Georgia"], statesOf })).toEqual(["s-1", "s-3"])
  })

  it("counts a section's own Owner as its company", () => {
    const owned: Section = withClaims(section("s-4"), [
      ...section("s-4").claims!,
      {
        attribute: "Owner",
        value: "Invented Pipe Co.",
        citations: [{ source: "Invented Gas Review, 1937", role: "states" }],
        proposals: [],
      },
    ])
    expect(companiesOf(owned, new Map())).toEqual(["Invented Pipe Co."])
  })

  it("counts each option with the other filters on, not its own", () => {
    const sections = editionRows(network, NO_CRITERIA.rule)
    const counts = optionCounts(
      sections,
      {
        ...NO_CRITERIA,
        editionYears,
        firstSeenEditions: ["ed-1931"],
        changedOnly: true,
      },
      "firstSeenEditions",
      (s) => [firstSeenEditionId(s, editionYears) ?? ""]
    )
    // Changed since review leaves s-2 only; choosing an edition ignores the
    // one chosen.
    expect(counts).toEqual([
      { name: "ed-1931", count: 0 },
      { name: "ed-1937", count: 1 },
    ])
  })

  it("cuts a group's row to what the filters leave, and counts it again", () => {
    const editions = editionRows(network, NO_CRITERIA.rule)
    const none = { ...NO_CRITERIA, editionYears, diameters: ["6 in"] }
    const rows = narrowRows(editions, none)
    // Only s-3 has that diameter: one row, one section.
    expect(rows.map((r) => [r.label, r.sections.map((x) => x.id)])).toEqual([
      ["1937 edition", ["s-3"]],
    ])
    expect(Object.values(rows[0].statusCounts).reduce((a, b) => a + b)).toBe(1)
    // With no filter a row is the group itself, not a copy.
    expect(narrowRows(editions, NO_CRITERIA)).toEqual(editions)
    expect(narrowRows(editions, NO_CRITERIA)[0]).toBe(editions[0])
  })

  it("cuts a group's row to the map view; a pipeline's row stays whole", () => {
    const north: [number, number, number, number] = [-1, 9, 3, 12]
    const editions = editionRows(network, NO_CRITERIA.rule)
    expect(
      narrowRows(editions, NO_CRITERIA, north).map((r) => [
        r.label,
        r.sections.map((x) => x.id),
      ])
    ).toEqual([
      ["1931 edition", ["s-1"]],
      ["1937 edition", ["s-2"]],
    ])
    const pipelines = summarise(network, NO_CRITERIA.rule, "pipelines")
    const rows = narrowRows(
      pipelines,
      { ...NO_CRITERIA, changedOnly: true },
      north
    )
    // North line has one section changed since review: the row is all of it.
    expect(rows.map((r) => [r.id, r.sections.length])).toEqual([["p-1", 2]])
  })
})
