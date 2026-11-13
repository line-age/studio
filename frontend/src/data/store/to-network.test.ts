import { describe, expect, it } from "vitest"

import { NO_PIPELINE_ID, summarise } from "@/data/derive"
import {
  ID_A,
  ID_B,
  ID_C,
  ID_X,
  ID_Y,
  LINE_1,
  LINE_2,
  storeFeatures,
  storeLines,
  storeMemberships,
  storeLinks,
  storeRemovals,
  storeRows,
} from "@/test/store-payloads"

import { StoreError } from "./client"
import { toNetwork } from "./to-network"

const network = toNetwork("Gas network", storeRows(), storeFeatures(), {
  links: storeLinks(),
  removals: storeRemovals(),
})
const section = (id: string) => network.sections.find((s) => s.id === id)!
const claim = (id: string, attribute: string) =>
  section(id).claims.find((c) => c.attribute === attribute)!

describe("toNetwork", () => {
  it("makes one edition per year of the map sheets cited, oldest first", () => {
    expect(network.editions.map((e) => e.label)).toEqual([
      "1931 edition",
      "1937 edition",
    ])
  })

  it("makes two sheets of the same year one edition", () => {
    // One feature's map citations now name a second sheet of their year.
    const features = storeFeatures()
    for (const claim of features[0].claims) {
      for (const c of claim.citations) {
        if (c.source_kind === "map_sheet") c.source_id = "another-sheet"
      }
    }
    const twice = toNetwork("Gas network", storeRows(), features)
    expect(JSON.stringify(features)).toContain("another-sheet")
    expect(twice.editions.map((e) => e.label)).toEqual([
      "1931 edition",
      "1937 edition",
    ])
    expect(twice.sections.map((s) => s.editionIds)).toEqual(
      network.sections.map((s) => s.editionIds)
    )
  })

  it("has no pipelines while store has none", () => {
    expect(network.pipelines).toEqual([])
    expect(network.sections.every((s) => s.pipelineId === null)).toBe(true)
  })

  it("makes one section per feature, whatever rows store draws it as", () => {
    expect(network.sections.map((s) => s.id)).toEqual([ID_A, ID_B, ID_C])
  })

  it("puts a section in its first edition and every later one", () => {
    expect(section(ID_A).editionIds).toHaveLength(2)
    expect(section(ID_B).editionIds).toEqual([network.editions[1].id])
  })

  it("ends a section only on a confirmed end", () => {
    expect(section(ID_C).editionIds).toEqual([network.editions[0].id])
    // A is only proposed to end: it is still in every edition.
    expect(section(ID_A).editionIds).toHaveLength(network.editions.length)
  })

  it("keeps what a source does for a claim, and a map's date", () => {
    const [shows] = claim(ID_A, "Geometry").citations
    expect(shows).toMatchObject({
      id: "cit-1931",
      role: "map_shows",
      asOf: "1931-06",
    })
    expect(claim(ID_B, "Diameter").citations[0].role).toBe("states")
  })

  it("keeps a trace file apart from a place in the source", () => {
    const [shows] = claim(ID_A, "Geometry").citations
    expect(shows.file).toBe("traced in test/1931")
    expect(shows.locator).toBeUndefined()
    // A text's place stays the place.
    const [states] = claim(ID_B, "Diameter").citations
    expect(states.locator).toBe("traced in test/1937")
    expect(states.file).toBeUndefined()
  })

  it("keeps a claim's id and the period it holds for", () => {
    expect(claim(ID_A, "Geometry").valid).toBe("../1931-06")
    expect(claim(ID_A, "Geometry").id).toMatch(/^route-1931/)
    expect(claim(ID_A, "First seen").id).toBeUndefined()
  })

  it("words a status a map supports as shown by the map's date", () => {
    expect(claim(ID_A, "Status").value).toBe("Shown by June 1931")
    expect(JSON.stringify(network)).not.toMatch(/operational/i)
  })

  it("keeps a status a text states as the text gives it", () => {
    const features = storeFeatures()
    const status = features[0].claims.find((c) => c.attribute_key === "status")!
    status.citations = [{ ...status.citations[0], role: "states" }]
    const out = toNetwork("Gas network", storeRows(), features)
    const stated = out.sections[0].claims.find((c) => c.attribute === "Status")
    expect(stated?.value).toBe("operational")
  })

  it("shows a proposed same_as link as a proposed end, Last seen Unknown", () => {
    expect(claim(ID_A, "Last seen").value).toBeNull()
    expect(section(ID_A).proposedEnds).toEqual([
      expect.objectContaining({
        id: "link-end",
        kind: "end",
        otherSectionId: ID_X,
        score: 0.986,
        proposer: "stitch",
      }),
    ])
    const roles = section(ID_A).proposedEnds[0].citations.map((c) => c.role)
    expect(roles).toEqual(["map_shows", "map_omits"])
  })

  it("shows a proposed overlaps link as a proposed cut", () => {
    expect(section(ID_B).proposedEnds).toEqual([
      expect.objectContaining({ id: "link-cut", kind: "cut", score: 0.75 }),
    ])
    expect(section(ID_B).proposedEnds[0].otherSectionId).toBe(ID_Y)
  })

  it("cites Last seen to both maps once a person has confirmed the end", () => {
    const last = claim(ID_C, "Last seen")
    expect(last.value).toBe("1931 edition, not on 1937")
    expect(last.citations.map((c) => c.role)).toEqual([
      "map_shows",
      "map_omits",
    ])
    expect(section(ID_C).proposedEnds).toEqual([])
  })

  it("never lists or counts a line traced as gone", () => {
    expect(network.sections.map((s) => s.id)).not.toContain(ID_X)
    expect(
      summarise(network, undefined, "sections").flatMap((g) => g.sections)
    ).toHaveLength(3)
  })

  it("names who proposed a link only when it is a tool", () => {
    // The same agent is seen asserting a claim as a person: no name.
    const features = storeFeatures()
    features[0].claims[0] = {
      ...features[0].claims[0],
      asserted_by: "agent-stitch",
      asserted_by_kind: "person",
    }
    const out = toNetwork("Gas network", storeRows(), features, {
      links: storeLinks(),
      removals: storeRemovals(),
    })
    expect(out.sections[0].proposedEnds[0].proposer).toBeUndefined()
    // Store says outright that a person asserted the link: no name.
    const links = storeLinks().map((l) => ({
      ...l,
      asserted_by_kind: "person",
    }))
    const named = toNetwork("Gas network", storeRows(), storeFeatures(), {
      links,
      removals: storeRemovals(),
    })
    expect(JSON.stringify(named)).not.toContain("stitch")
  })

  it("leaves out a link whose line traced as gone was not read", () => {
    const out = toNetwork("Gas network", storeRows(), storeFeatures(), {
      links: storeLinks(),
    })
    expect(out.sections.flatMap((s) => s.proposedEnds)).toEqual([])
  })

  it("draws the route as traced, in two ordinates", () => {
    expect(section(ID_A).geometry).toEqual({
      type: "LineString",
      coordinates: [
        [0, 10],
        [1, 10],
      ],
    })
  })

  it("shows the year as First seen and leaves Build date Unknown", () => {
    expect(claim(ID_A, "First seen").value).toBe("1931 edition")
    expect(claim(ID_A, "First seen").citations[0].source).toBe(
      "Invented trunk line map, 1931"
    )
    expect(claim(ID_A, "Build date").value).toBeNull()
    expect(claim(ID_A, "Last seen").value).toBeNull()
  })

  it("shows accepted claims as cited values and the rest as Unknown", () => {
    expect(claim(ID_B, "Diameter").value).toBe("12 in")
    expect(claim(ID_B, "Diameter").citations[0].quote).toBe('"12 IN."')
    expect(claim(ID_B, "Status").value).not.toBe("operational")
    expect(claim(ID_B, "Geometry").value).toBe("Traced line")
    expect(claim(ID_A, "Diameter").value).toBeNull()
  })

  it("shows a candidate claim as a proposal, never as a cited value", () => {
    // Beside the accepted value, never in place of it.
    const diameter = claim(ID_B, "Diameter")
    expect(diameter.value).toBe("12 in")
    expect(diameter.proposals.map((p) => p.value)).toEqual(["16 in"])
  })

  it("leaves a section with no label unnamed, under a short code", () => {
    expect(section(ID_A).name).toBeNull()
    expect(section(ID_A).code).toBe("aaaaaaaa")
    expect(section(ID_C).name).toBe("Dale to Elm")
  })

  it("carries no name of whoever asserted a claim", () => {
    const features = storeFeatures().map((f) => ({
      ...f,
      claims: f.claims.map((c) => ({ ...c, asserted_by_name: "A. Tracer" })),
    }))
    const out = toNetwork("Gas network", storeRows(), features)
    expect(JSON.stringify(out)).not.toContain("A. Tracer")
  })

  it("puts a section confirmed part of a line in that pipeline", () => {
    const rows = storeRows().map((row) =>
      row.section_id === ID_A ? { ...row, line_id: "line-1" } : row
    )
    const out = toNetwork("Gas network", rows, storeFeatures())
    expect(out.sections.find((s) => s.id === ID_A)?.pipelineId).toBe("line-1")
    expect(out.pipelines.map((p) => p.id)).toEqual(["line-1"])
  })

  describe("pipelines", () => {
    const piped = toNetwork("Gas network", storeRows(), storeFeatures(), {
      links: storeMemberships(),
      lines: storeLines(),
    })
    const of = (id: string) => piped.sections.find((s) => s.id === id)!
    const line = (id: string) => piped.pipelines.find((p) => p.id === id)!

    it("puts a section in a pipeline only once the link is confirmed", () => {
      expect(of(ID_A).pipelineId).toBe(LINE_1)
      expect(of(ID_B).pipelineId).toBeNull()
      expect(of(ID_C).pipelineId).toBeNull()
    })

    it("shows a proposed part_of link as a proposed membership", () => {
      expect(of(ID_B).proposedMemberships).toEqual([
        {
          id: "link-part-b",
          pipelineId: LINE_2,
          score: 0.7,
          proposer: "stitch",
        },
      ])
      // A rejected link is nothing.
      expect(of(ID_C).proposedMemberships).toEqual([])
      expect(of(ID_A).proposedMemberships).toEqual([])
    })

    it("names a pipeline from its name claim, or leaves it Unknown", () => {
      expect(line(LINE_1).name).toBe("Alder trunk")
      expect(line(LINE_2).name).toBeNull()
      expect(line(LINE_2).code).toBe("22222222")
      expect(line(LINE_2).claims).toEqual([])
    })

    it("keeps every owner of a pipeline with its period, never merged", () => {
      const owners = line(LINE_1).claims.filter((c) => c.attribute === "Owner")
      expect(owners.map((c) => [c.value, c.valid])).toEqual(
        expect.arrayContaining([
          ["Alder Gas Co.", "../1931"],
          ["Yew Fuel Co.", "1936/.."],
        ])
      )
      expect(owners).toHaveLength(2)
      expect(owners[0].citations[0]).toMatchObject({
        role: "states",
        locator: "p. 41",
      })
    })

    it("shows a candidate on a pipeline as a proposal on an Unknown row", () => {
      const operator = line(LINE_1).claims.find(
        (c) => c.attribute === "Operator"
      )!
      expect(operator.value).toBeNull()
      expect(operator.proposals.map((p) => p.value)).toEqual(["Alder Gas Co."])
    })

    it("never shows an owner as a section's own", () => {
      for (const section of piped.sections) {
        expect(section.claims.map((c) => c.attribute)).not.toContain("Owner")
      }
    })

    it("lists pipelines, then the proposed one, and every section apart", () => {
      expect(summarise(piped).map((g) => [g.id, g.kind])).toEqual([
        [LINE_1, "pipeline"],
        [LINE_2, "proposed"],
        [NO_PIPELINE_ID, "group"],
      ])
      expect(
        summarise(piped, undefined, "sections").flatMap((g) =>
          g.sections.map((s) => s.id)
        )
      ).toEqual([ID_A, ID_C, ID_B])
    })
  })

  it("says so when store has nothing, or a section has no route", () => {
    expect(() => toNetwork("Gas network", [], [])).toThrow(StoreError)
    const broken = storeFeatures()
    broken[0].claims = []
    let detail = ""
    try {
      toNetwork("Gas network", storeRows(), broken)
    } catch (error) {
      if (error instanceof StoreError) detail = error.detail
    }
    expect(detail).toMatch(/no accepted route/)
  })

  it("lists the sections under the edition that first shows them", () => {
    const groups = summarise(network, undefined, "sections")
    // C ended before 1937: it is still listed, under the edition it is on.
    expect(groups.map((g) => [g.name, g.sections.map((s) => s.id)])).toEqual([
      ["First seen in the 1931 edition", [ID_A, ID_C]],
      ["First seen in the 1937 edition", [ID_B]],
    ])
    // No pipelines in store: by pipeline, every section is in the one row.
    expect(summarise(network).map((g) => [g.name, g.sections.length])).toEqual([
      ["No pipeline", 3],
    ])
    expect(groups.every((g) => g.unassigned)).toBe(true)
  })
})
