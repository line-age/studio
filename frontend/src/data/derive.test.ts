import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import {
  UNASSIGNED_ID,
  geometryBounds,
  inView,
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
    expect(summaries.map((s) => s.id)).toEqual(["p-1", "p-2", UNASSIGNED_ID])
    expect(summaries[2]).toMatchObject({
      name: "Not in a pipeline",
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

  it("adds up the facts of a pipeline", () => {
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
    expect(ids({ show: "unknown", view: null })).toEqual(["p-1", UNASSIGNED_ID])
    expect(ids({ show: "all", view: [-1, 9, 3, 12] })).toEqual(["p-1"])
    expect(ids({ show: "all", view: [100, 0, 101, 1] })).toEqual([])
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

  it("never matches an Unknown value", () => {
    expect(search(summaries, "unknown")).toEqual([])
  })
})
