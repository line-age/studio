import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import {
  citationLine,
  confidenceWords,
  editionWords,
  formatAsOf,
  formatMadeAt,
  formatValid,
  proposalCount,
  proposedEndsFor,
  proposedEndWords,
  roleWords,
  shownBy,
} from "./evidence"
import { needsDecision } from "./status"

describe("formatValid", () => {
  it("says a period as the source gives it, never a bare year", () => {
    expect(formatValid("../1929-08")).toBe("by August 1929")
    expect(formatValid("/1929")).toBe("by 1929")
    expect(formatValid("1929-08/1931")).toBe("between August 1929 and 1931")
    expect(formatValid("1931/..")).toBe("from 1931")
    expect(formatValid("1931")).toBe("in 1931")
    expect(formatValid("1931-03-04")).toBe("on 4 March 1931")
  })

  it("gives back a form it cannot read rather than guess", () => {
    expect(formatValid("193X")).toBe("193X")
    expect(formatValid("1929-13")).toBe("1929-13")
    expect(formatValid("../..")).toBe("../..")
  })
})

describe("a map's date", () => {
  it("is the last day the date covers", () => {
    expect(formatAsOf("1953")).toBe("as of 31 December 1953")
    expect(formatAsOf("1929-08")).toBe("as of 31 August 1929")
    expect(formatAsOf("1932-02")).toBe("as of 29 February 1932")
    expect(formatAsOf("1929-08-15")).toBe("as of 15 August 1929")
  })

  it("goes with the edition", () => {
    expect(editionWords({ source: "A map", asOf: "1953" })).toBe(
      "1953 edition, as of 31 December 1953"
    )
    expect(editionWords({ source: "A journal" })).toBeUndefined()
  })
})

describe("what a source does for a claim", () => {
  it("is said in words", () => {
    expect(roleWords("map_shows")).toBe("Shown on")
    expect(roleWords("map_omits")).toBe("Not on")
    expect(roleWords("states")).toBe("States")
    expect(roleWords(undefined)).toBeUndefined()
  })

  it("leads a citation told in one line", () => {
    expect(
      citationLine({
        source: "A map",
        role: "map_shows",
        locator: "grid ref. A-1",
        quote: '"12 IN."',
      })
    ).toBe('"12 IN." Shown on A map, grid ref. A-1.')
    expect(citationLine({ source: "A journal" })).toBe("A journal.")
  })

  it("says a map shows a line by its date, and nothing more", () => {
    expect(
      shownBy({ source: "A map", role: "map_shows", asOf: "1929-08" })
    ).toBe("Shown by August 1929")
    expect(
      shownBy({ source: "A map", role: "map_omits", asOf: "1931" })
    ).toBeNull()
    expect(shownBy({ source: "A map", role: "map_shows" })).toBeNull()
  })
})

describe("a proposed end or cut", () => {
  const line = {
    type: "LineString" as const,
    coordinates: [
      [0, 0],
      [1, 1],
    ] as [number, number][],
  }
  const end = {
    id: "e-1",
    kind: "end" as const,
    otherSectionId: "gone-1",
    score: 0.986,
    proposer: "stitch",
    geometry: line,
    citations: [
      { source: "A map", role: "map_shows" as const, asOf: "1929-08" },
      { source: "A later map", role: "map_omits" as const, asOf: "1931" },
    ],
  }

  it("is told with the tool, the two editions and the score", () => {
    expect(proposedEndWords(end)).toBe(
      "The stitch tool proposes 1929, not on 1931. A line traced as gone between the two editions runs along this whole section. Score 0.99."
    )
    expect(proposedEndWords({ ...end, kind: "cut", score: 0 })).toBe(
      "The stitch tool proposes to cut this section in two. A line traced as gone between the 1929 and 1931 editions runs along part of it: one part would end, the other carry on. Score 0.00."
    )
  })

  it("names no one when the proposer is not known to be a tool", () => {
    const words = proposedEndWords({
      ...end,
      proposer: undefined,
      citations: [],
    })
    expect(words).toMatch(/^A tool proposes that this section ends\./)
  })

  it("waits on Last seen when an end, on Geometry when a cut", () => {
    const [section] = testNetwork().sections
    const withEnds = {
      ...section,
      claims: [
        ...section.claims,
        { attribute: "Last seen", value: null, citations: [], proposals: [] },
        {
          attribute: "Geometry",
          value: "Traced line",
          citations: [{ source: "A map" }],
          proposals: [],
        },
      ],
      proposedEnds: [end, { ...end, id: "e-2", kind: "cut" as const }],
    }
    expect(proposedEndsFor(withEnds, "Last seen").map((e) => e.id)).toEqual([
      "e-1",
    ])
    expect(proposedEndsFor(withEnds, "Geometry").map((e) => e.id)).toEqual([
      "e-2",
    ])
    expect(proposedEndsFor(withEnds, "Owner")).toEqual([])
    const lastSeen = withEnds.claims.find((c) => c.attribute === "Last seen")!
    expect(proposalCount(withEnds, lastSeen)).toBe(1)
    expect(needsDecision(section)).toBe(false)
    expect(needsDecision(withEnds)).toBe(true)
  })
})

describe("when a claim was made, and how sure a citation is", () => {
  it("words the day a claim was made", () => {
    expect(formatMadeAt("2026-11-12")).toBe("12 November 2026")
    expect(formatMadeAt("not a date")).toBe("not a date")
  })

  it("words a confidence as recorded, out of 1", () => {
    expect(confidenceWords(0.8)).toBe("0.8 of 1")
    expect(confidenceWords(1)).toBe("1 of 1")
  })
})
