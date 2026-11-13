import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { parseNetwork } from "./schema"
import {
  NO_CRITERIA,
  firstEdition,
  groupSelection,
  groupsLabel,
  sectionLabel,
  selectionSize,
  firstSeenGroupId,
  addedSpan,
  attributeNames,
  buildYear,
  buildYearSpan,
  companiesOf,
  companyCounts,
  datedValue,
  defaultList,
  ownersBySection,
  pipelineClaims,
  summaryProgress,
  matchesCriteria,
  sectionMatches,
  geometryBounds,
  inView,
  matchesUnknownIn,
  unknownCounts,
  intersects,
  search,
  sectionStats,
  sectionsOutsideEdition,
  filterCounts,
  summarise,
  visiblePipelines,
} from "./derive"

const network = testNetwork()
const summaries = summarise(network, "ed-1937")
const sectionGroups = summarise(network, "ed-1937", undefined, "sections")
const owners = ownersBySection(network)

describe("sectionStats", () => {
  it("counts a claim as cited only when it has a value", () => {
    expect(sectionStats(network.sections[0])).toEqual({
      total: 2,
      cited: 2,
      unknown: 0,
      proposals: 0,
    })
    expect(sectionStats(network.sections[1])).toEqual({
      total: 2,
      cited: 0,
      unknown: 2,
      proposals: 1,
    })
  })
})

describe("summarise", () => {
  it("lists pipelines in file order, then the proposed ones; no loose section", () => {
    expect(summaries.map((s) => [s.id, s.kind])).toEqual([
      ["p-1", "pipeline"],
      ["p-2", "pipeline"],
      ["p-3", "proposed"],
    ])
    // A proposed pipeline holds the sections proposed for it, with the score.
    expect(summaries[2].sections.map((s) => s.id)).toEqual(["s-4"])
    expect(summaries[2].scores).toEqual([0.7, 0.7])
    expect(summaryProgress(summaries[2])).toBe("Score 0.70")
    // No source names it: it goes by its code.
    expect(summaries[2].name).toBe("P-003")
    expect(summaries[2].pipeline?.name).toBeNull()
  })

  it("lists every section in the Sections list, in a pipeline or not", () => {
    expect(
      sectionGroups.map((g) => [g.name, g.sections.map((s) => s.id)])
    ).toEqual([
      ["First seen in the 1931 edition", ["s-1"]],
      ["First seen in the 1937 edition", ["s-2", "s-3", "s-4"]],
    ])
    expect(sectionGroups[1]).toMatchObject({
      id: firstSeenGroupId("ed-1937"),
      code: null,
      kind: "first-seen",
      unassigned: true,
      pipeline: null,
    })
  })

  it("opens on the pipelines, or on the sections when there are none", () => {
    expect(defaultList(network)).toBe("pipelines")
    expect(defaultList({ ...network, pipelines: [] })).toBe("sections")
  })

  it("lists a pipeline's claims, one row per period, Unknown where none", () => {
    const [north, south] = network.pipelines
    expect(
      pipelineClaims(north).map((c) => [c.attribute, datedValue(c)])
    ).toEqual([
      ["Name", null],
      ["Owner", "Alder Gas Co., by 1931"],
      ["Owner", "Yew Fuel Co., from 1936"],
      ["Operator", null],
    ])
    expect(pipelineClaims(south).map((c) => c.value)).toEqual([
      null,
      null,
      null,
    ])
  })

  it("keeps only the sections the edition shows", () => {
    expect(summaries[1].sections.map((s) => s.id)).toEqual(["s-3"])
    const earlier = summarise(network, "ed-1931")
    expect(earlier.map((s) => s.id)).toEqual(["p-1", "p-2"])
    // The section proposed for the third pipeline is not in this edition.
    expect(earlier[0].sections.map((s) => s.id)).toEqual(["s-1"])
  })

  it("adds up the claims of a pipeline", () => {
    expect(summaries[0].stats).toEqual({
      total: 4,
      cited: 2,
      unknown: 2,
      proposals: 1,
    })
    expect(summaries[0].bounds).toEqual([0, 10, 2, 11])
  })

  it("finds the sections another edition shows and this one does not", () => {
    expect(sectionsOutsideEdition(network, "ed-1937").map((s) => s.id)).toEqual(
      ["s-5"]
    )
  })
})

describe("filters", () => {
  const two = { ...NO_CRITERIA, rule: ["Diameter", "Build date"] }

  it("counts sections by status, and the counts add up to All", () => {
    const counts = filterCounts(summaries, two)
    expect(counts).toEqual({
      all: 4,
      status: { "not-started": 2, "in-progress": 0, sufficient: 0, done: 2 },
      // A diameter proposed on one, a pipeline proposed for another.
      needsDecision: 2,
    })
    // The Sections list counts the same sections.
    expect(filterCounts(sectionGroups, two)).toEqual(counts)
    expect(Object.values(counts.status).reduce((a, b) => a + b)).toBe(
      counts.all
    )
  })

  it("keeps each count true to what choosing it would show", () => {
    // A status chosen does not change the status counts, only the mark's.
    const done = filterCounts(summaries, { ...two, status: "done" })
    expect(done.status["not-started"]).toBe(2)
    expect(done.needsDecision).toBe(0)
    // The mark narrows the status counts to sections with a proposal.
    const waiting = filterCounts(summaries, { ...two, needsDecision: true })
    expect(waiting.all).toBe(2)
    expect(waiting.status["not-started"]).toBe(2)
  })

  it("keeps a pipeline when any of its sections has the status", () => {
    const ids = (filters: Parameters<typeof visiblePipelines>[1]) =>
      visiblePipelines(summaries, filters).map((s) => s.id)
    // North line has one done section and one not started: it stays for both.
    expect(ids({ ...two, status: "done", view: null })).toEqual(["p-1", "p-2"])
    expect(ids({ ...two, status: "not-started", view: null })).toEqual([
      "p-1",
      "p-3",
    ])
    expect(ids({ ...two, needsDecision: true, view: null })).toEqual([
      "p-1",
      "p-3",
    ])
    expect(
      ids({ ...two, status: "done", needsDecision: true, view: null })
    ).toEqual([])
  })

  it("counts only the sections in view of a group by first seen", () => {
    // The 1937 group spans the map; North line's two sections are in view.
    const north: [number, number, number, number] = [-1, 9, 3, 12]
    expect(filterCounts(sectionGroups, NO_CRITERIA, north).all).toBe(2)
    // A pipeline in view counts whole, as it always has.
    expect(filterCounts(summaries, NO_CRITERIA, north).all).toBe(2)
  })

  it("narrows by the map view", () => {
    const ids = (filters: Parameters<typeof visiblePipelines>[1]) =>
      visiblePipelines(summaries, filters).map((s) => s.id)
    expect(ids({ view: [-1, 9, 3, 12] })).toEqual(["p-1"])
    expect(ids({ view: [100, 0, 101, 1] })).toEqual([])
  })

  it("narrows to pipelines with an Unknown value for a chosen attribute", () => {
    const names = attributeNames(summaries)
    expect(names.length).toBeGreaterThan(0)
    expect(matchesUnknownIn(summaries[0], [])).toBe(true)
    for (const name of names) {
      const expected = summaries
        .filter((s) =>
          s.sections.some((sec) =>
            sec.claims.some((c) => c.attribute === name && c.value === null)
          )
        )
        .map((s) => s.id)
      expect(
        visiblePipelines(summaries, {
          view: null,
          unknownIn: [name],
        }).map((s) => s.id)
      ).toEqual(expected)
    }
  })

  it("counts the sections with an attribute Unknown, not the rows", () => {
    // Diameter is Unknown on one section of North line and on the loose one.
    expect(unknownCounts(summaries).get("Diameter")).toBe(2)
    // Owner is never a section's: it is not among their attributes.
    expect(attributeNames(summaries)).not.toContain("Owner")
    for (const [name, count] of unknownCounts(summaries)) {
      expect(
        filterCounts(summaries, { ...NO_CRITERIA, unknownIn: [name] }).all
      ).toBe(count)
    }
  })

  it("narrows by company and by build year, on the same section", () => {
    const owned = { ...NO_CRITERIA, owners }
    const companies = companyCounts(summaries, owners)
    // The company is the pipeline's owner; both of North line's count, for
    // both of its sections. South line's owner is Unknown: it has none.
    expect(companies).toEqual([
      { name: "Alder Gas Co.", count: 2 },
      { name: "Yew Fuel Co.", count: 2 },
    ])
    for (const { name, count } of companies) {
      const kept = visiblePipelines(summaries, {
        view: null,
        owners,
        companies: [name],
      })
      expect(kept.map((s) => s.id)).toEqual(["p-1"])
      // The number beside a company is sections, as every number is.
      expect(filterCounts(summaries, { ...owned, companies: [name] }).all).toBe(
        count
      )
    }
    // A section in no pipeline has no company, whatever is proposed for it.
    expect(companiesOf(network.sections[3], owners)).toEqual([])
    // Without the pipelines' owners no section has a company.
    expect(
      sectionMatches(network.sections[0], {
        ...NO_CRITERIA,
        companies: ["Alder Gas Co."],
      })
    ).toBe(false)

    const section = network.sections[0]
    const none = { ...owned, companies: ["No such company"] }
    expect(sectionMatches(section, none)).toBe(false)
    // An Unknown build date is in no range.
    const unknownBuilt = network.sections.find((s) => buildYear(s) === null)
    if (unknownBuilt) {
      expect(
        sectionMatches(unknownBuilt, { ...NO_CRITERIA, builtFrom: 1000 })
      ).toBe(false)
    }
    const span = buildYearSpan(summaries)
    if (span) {
      const inside = { ...NO_CRITERIA, builtFrom: span[0], builtTo: span[1] }
      const after = { ...NO_CRITERIA, builtFrom: span[1] + 1 }
      expect(summaries.some((s) => matchesCriteria(s, inside))).toBe(true)
      expect(summaries.some((s) => matchesCriteria(s, after))).toBe(false)
    }
  })

  it("narrows by the day a record was added; no day means in no range", () => {
    const dated = network.sections.find((s) => s.addedAt === "2026-10-05")!
    const undated = network.sections.find((s) => !s.addedAt)!
    const on = (from: string | null, to: string | null) => ({
      ...NO_CRITERIA,
      addedFrom: from,
      addedTo: to,
    })
    expect(sectionMatches(dated, on("2026-10-05", "2026-10-05"))).toBe(true)
    expect(sectionMatches(dated, on("2026-10-06", null))).toBe(false)
    expect(sectionMatches(dated, on(null, "2026-10-04"))).toBe(false)
    expect(sectionMatches(undated, on("2000-01-01", null))).toBe(false)
    expect(addedSpan(summaries)).toEqual(["2026-10-05", "2026-10-05"])
  })

  it("treats a missing view as everything in view", () => {
    expect(inView(summaries[0], null)).toBe(true)
  })

  it("knows when two boxes touch", () => {
    expect(intersects([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true)
    expect(intersects([0, 0, 1, 1], [1.1, 0, 2, 1])).toBe(false)
    expect(geometryBounds(network.sections[1].geometry)).toEqual([1, 10, 2, 11])
  })
})

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(search(summaries, "   ")).toEqual([])
  })

  it("matches a pipeline by name or code, ignoring case", () => {
    const hits = search(summaries, "north")
    expect(hits).toHaveLength(1)
    expect(hits[0].matches[0]).toEqual({ kind: "pipeline", sections: 2 })
    expect(search(summaries, "p-002")[0].summary.id).toBe("p-2")
  })

  it("names the one section that matched and can open it", () => {
    const [hit] = search(summaries, "cedar")
    expect(hit.matches).toEqual([
      {
        kind: "section",
        sectionId: "s-2",
        name: "Birch to Cedar",
        code: "S-0002",
      },
    ])
    expect(hit.firstSectionId).toBe("s-2")
  })

  it("counts sections when several match", () => {
    const [hit] = search(summaries, "birch")
    expect(hit.matches).toEqual([{ kind: "sections", count: 2 }])
  })

  it("finds a pipeline by what is claimed about it, such as its owner", () => {
    const hits = search(summaries, "alder gas")
    expect(hits.map((h) => h.summary.id)).toEqual(["p-1"])
    expect(hits[0].matches[0]).toEqual({ kind: "pipeline", sections: 2 })
  })

  it("matches cited values and says how many sections carry them", () => {
    const hits = search(summaries, "6 in")
    expect(hits.map((h) => h.summary.id)).toEqual(["p-2"])
    expect(hits[0].matches).toEqual([
      { kind: "claim", attribute: "Diameter", value: "6 in", sections: 1 },
    ])
  })

  it("lists every section that matched, with the claim when it was a value", () => {
    const [hit] = search(summaries, "cedar")
    expect(hit.sections.map((s) => s.reason)).toEqual([null])
    const [byValue] = search(summaries, "6 in")
    expect(byValue.sections).toHaveLength(1)
    expect(byValue.sections[0].reason).toBe("Diameter: 6 in")
  })

  it("finds sections with Unknown claims for the word unknown", () => {
    const hits = search(summaries, "unknown")
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(hit.matches[0].kind).toBe("unknown")
      expect(hit.sections.every((s) => s.reason?.endsWith(": Unknown"))).toBe(
        true
      )
    }
    const diameter = search(summaries, "unknown diameter")
    expect(diameter.length).toBeGreaterThan(0)
    expect(
      diameter.every((hit) =>
        hit.sections.every((s) => s.reason?.includes("Diameter"))
      )
    ).toBe(true)
    expect(search(summaries, "unknown zzz")).toEqual([])
  })
})

describe("sections in no pipeline", () => {
  // The same sections, in data that has no pipelines yet.
  const loose = parseNetwork({
    ...JSON.parse(JSON.stringify(network)),
    pipelines: [],
    sections: network.sections.map((s) => ({
      ...s,
      pipelineId: null,
      proposedMemberships: [],
      name: s.id === "s-4" ? null : s.name,
    })),
  })

  it("finds the edition a section is first seen on", () => {
    expect(firstEdition(network, network.sections[0])?.id).toBe("ed-1931")
    expect(firstEdition(network, network.sections[1])?.id).toBe("ed-1937")
  })

  const looseGroups = (edition: string) =>
    summarise(loose, edition, undefined, "sections")

  it("has an empty Pipelines list; it does not borrow sections", () => {
    expect(summarise(loose, "ed-1937")).toEqual([])
  })

  it("lists each edition with the sections it is the first to show", () => {
    const groups = looseGroups("ed-1937")
    expect(groups.map((g) => [g.name, g.sections.map((s) => s.id)])).toEqual([
      ["First seen in the 1931 edition", ["s-1"]],
      ["First seen in the 1937 edition", ["s-2", "s-3", "s-4"]],
    ])
    expect(groups.every((g) => g.unassigned)).toBe(true)
    expect(groups.map((g) => g.firstSeen?.year)).toEqual([1931, 1937])
  })

  it("shows only what an earlier edition shows when that one is in force", () => {
    const groups = looseGroups("ed-1931")
    expect(groups.map((g) => g.sections.map((s) => s.id))).toEqual([
      ["s-1", "s-5"],
    ])
  })

  it("words a selection without pipelines when it has none", () => {
    const groups = groupSelection(
      looseGroups("ed-1937"),
      new Set(["s-1", "s-2"])
    )
    expect(selectionSize(groups)).toBe("2 sections")
    expect(groupsLabel(groups.map((g) => g.summary))).toBe("2 groups")
  })

  it("calls an unnamed section by its code, and finds it by it", () => {
    const unnamed = loose.sections.find((s) => s.id === "s-4")!
    expect(sectionLabel(unnamed)).toBe("S-0004")
    const hits = search(looseGroups("ed-1937"), "s-0004")
    expect(hits[0].sections).toEqual([
      { sectionId: "s-4", name: "S-0004", code: null, reason: null },
    ])
  })
})
