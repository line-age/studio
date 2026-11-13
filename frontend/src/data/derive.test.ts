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
  companyCounts,
  companyOf,
  matchesCriteria,
  sectionMatches,
  geometryBounds,
  inView,
  matchesUnknownIn,
  intersects,
  search,
  sectionStats,
  sectionsOutsideEdition,
  showCounts,
  summarise,
  visiblePipelines,
} from "./derive"

const network = testNetwork()
const summaries = summarise(network, "ed-1937")

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
  it("lists pipelines in file order, then sections in no pipeline", () => {
    expect(summaries.map((s) => s.id)).toEqual([
      "p-1",
      "p-2",
      firstSeenGroupId("ed-1937"),
    ])
    expect(summaries[2]).toMatchObject({
      name: "Not in a pipeline, 1937 edition",
      code: null,
      unassigned: true,
    })
  })

  it("keeps only the sections the edition shows", () => {
    expect(summaries[1].sections.map((s) => s.id)).toEqual(["s-3"])
    const earlier = summarise(network, "ed-1931")
    expect(earlier.map((s) => s.id)).toEqual(["p-1", "p-2"])
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
  it("counts pipelines per Show choice", () => {
    expect(showCounts(summaries)).toEqual({
      all: 3,
      unknown: 2,
      proposals: 1,
      changed: 1,
    })
  })

  it("narrows by the Show choice and by the map view", () => {
    const ids = (show: Parameters<typeof visiblePipelines>[1]) =>
      visiblePipelines(summaries, show).map((s) => s.id)
    expect(ids({ show: "unknown", view: null })).toEqual([
      "p-1",
      firstSeenGroupId("ed-1937"),
    ])
    expect(ids({ show: "all", view: [-1, 9, 3, 12] })).toEqual(["p-1"])
    expect(ids({ show: "all", view: [100, 0, 101, 1] })).toEqual([])
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
          show: "all",
          view: null,
          unknownIn: [name],
        }).map((s) => s.id)
      ).toEqual(expected)
    }
  })

  it("narrows by company and by build year, on the same section", () => {
    const companies = companyCounts(summaries)
    expect(companies.length).toBeGreaterThan(0)
    for (const { name, count } of companies) {
      const kept = visiblePipelines(summaries, {
        show: "all",
        view: null,
        companies: [name],
      })
      expect(kept).toHaveLength(count)
      expect(
        kept.every((s) => s.sections.some((sec) => companyOf(sec) === name))
      ).toBe(true)
    }

    const section = network.sections[0]
    const none = { ...NO_CRITERIA, companies: ["No such company"] }
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

  it("matches cited values and says how many sections carry them", () => {
    const hits = search(summaries, "alder gas")
    expect(hits.map((h) => h.summary.id)).toEqual(["p-1", "p-2"])
    expect(hits[1].matches).toEqual([
      {
        kind: "claim",
        attribute: "Owner",
        value: "Alder Gas Co.",
        sections: 1,
      },
    ])
  })

  it("lists every section that matched, with the claim when it was a value", () => {
    const [hit] = search(summaries, "birch")
    expect(hit.sections.map((s) => s.reason)).toEqual([null, null])
    const byValue = search(summaries, "alder gas")[1]
    expect(byValue.sections).toHaveLength(1)
    expect(byValue.sections[0].reason).toBe("Owner: Alder Gas Co.")
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
    const owner = search(summaries, "unknown owner")
    expect(
      owner.every((hit) =>
        hit.sections.every((s) => s.reason?.includes("Owner"))
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
      name: s.id === "s-4" ? null : s.name,
    })),
  })

  it("finds the edition a section is first seen on", () => {
    expect(firstEdition(network, network.sections[0])?.id).toBe("ed-1931")
    expect(firstEdition(network, network.sections[1])?.id).toBe("ed-1937")
  })

  it("lists each edition with the sections it is the first to show", () => {
    const groups = summarise(loose, "ed-1937")
    expect(groups.map((g) => [g.name, g.sections.map((s) => s.id)])).toEqual([
      ["Not in a pipeline, 1931 edition", ["s-1"]],
      ["Not in a pipeline, 1937 edition", ["s-2", "s-3", "s-4"]],
    ])
    expect(groups.every((g) => g.unassigned)).toBe(true)
    expect(groups.map((g) => g.firstSeen?.year)).toEqual([1931, 1937])
  })

  it("shows only what an earlier edition shows when that one is in force", () => {
    const groups = summarise(loose, "ed-1931")
    expect(groups.map((g) => g.sections.map((s) => s.id))).toEqual([
      ["s-1", "s-5"],
    ])
  })

  it("words a selection without pipelines when it has none", () => {
    const groups = groupSelection(
      summarise(loose, "ed-1937"),
      new Set(["s-1", "s-2"])
    )
    expect(selectionSize(groups)).toBe("2 sections")
    expect(groupsLabel(groups.map((g) => g.summary))).toBe("2 groups")
  })

  it("calls an unnamed section by its code, and finds it by it", () => {
    const unnamed = loose.sections.find((s) => s.id === "s-4")!
    expect(sectionLabel(unnamed)).toBe("S-0004")
    const hits = search(summarise(loose, "ed-1937"), "s-0004")
    expect(hits[0].sections).toEqual([
      { sectionId: "s-4", name: "S-0004", code: null, reason: null },
    ])
  })
})
