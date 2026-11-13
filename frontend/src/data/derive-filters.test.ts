import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import {
  companiesOf,
  diameterOf,
  membershipOf,
  NO_CRITERIA,
  optionCounts,
  sectionMatches,
  summarise,
  type SectionCriteria,
} from "./derive"
import type { Section } from "./schema"

/*
 * The filters added with the two-level Filters view (2026-11-13): where a
 * section stands with pipelines, the edition that first shows it, changed
 * since review, its cited diameter and the states it runs through.
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
  it("says where a section stands with pipelines", () => {
    expect(membershipOf(section("s-1"))).toBe("in")
    expect(membershipOf(section("s-4"))).toBe("proposed")
    const loose: Section = {
      ...section("s-4"),
      proposedMemberships: [],
    }
    expect(membershipOf(loose)).toBe("none")
    expect(passing({ memberships: ["proposed"] })).toEqual(["s-4"])
  })

  it("keeps the sections first seen in a range of edition years", () => {
    // s-1 is on the 1931 map as well as 1937: first seen 1931.
    expect(passing({ firstSeenFrom: 1937, firstSeenTo: 1937 })).toEqual([
      "s-2",
      "s-3",
      "s-4",
    ])
    expect(passing({ firstSeenTo: 1931 })).toEqual(["s-1", "s-5"])
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
    const owned: Section = {
      ...section("s-4"),
      claims: [
        ...section("s-4").claims,
        {
          attribute: "Owner",
          value: "Invented Pipe Co.",
          citations: [{ source: "Invented Gas Review, 1937", role: "states" }],
          proposals: [],
        } as unknown as Section["claims"][number],
      ],
    }
    expect(companiesOf(owned, new Map())).toEqual(["Invented Pipe Co."])
  })

  it("counts each option with the other filters on, not its own", () => {
    const sections = summarise(network, NO_CRITERIA.rule, "sections")
    const counts = optionCounts(
      sections,
      { ...NO_CRITERIA, editionYears, memberships: ["in"], changedOnly: true },
      "memberships",
      (s) => [membershipOf(s)]
    )
    // Changed since review leaves s-2 only; choosing a membership ignores
    // the one chosen.
    expect(counts).toEqual([
      { name: "in", count: 1 },
      { name: "proposed", count: 0 },
    ])
  })
})
