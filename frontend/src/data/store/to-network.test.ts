import { describe, expect, it } from "vitest"

import { editionProgress, summarise } from "@/data/derive"
import {
  ID_A,
  ID_B,
  ID_C,
  storeFeatures,
  storeRows,
} from "@/test/store-payloads"

import { StoreError } from "./client"
import { toNetwork } from "./to-network"

const network = toNetwork("Gas network", storeRows(), storeFeatures())
const section = (id: string) => network.sections.find((s) => s.id === id)!
const claim = (id: string, attribute: string) =>
  section(id).claims.find((c) => c.attribute === attribute)!

describe("toNetwork", () => {
  it("makes one edition per map sheet cited, oldest first", () => {
    expect(network.editions.map((e) => e.label)).toEqual([
      "1931 edition",
      "1937 edition",
    ])
  })

  it("groups by edition while store has no pipelines", () => {
    expect(network.groupBy).toBe("edition")
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

  it("shows accepted claims as cited facts and the rest as Unknown", () => {
    expect(claim(ID_B, "Diameter").value).toBe("12 in")
    expect(claim(ID_B, "Diameter").citations[0].quote).toBe('"12 IN."')
    expect(claim(ID_B, "Status").value).toBe("operational")
    expect(claim(ID_B, "Geometry").value).toBe("Traced line")
    expect(claim(ID_A, "Diameter").value).toBeNull()
    expect(claim(ID_A, "Owner").value).toBeNull()
  })

  it("shows a candidate claim as a proposal, never as a fact", () => {
    const owner = claim(ID_B, "Owner")
    expect(owner.value).toBeNull()
    expect(owner.proposals.map((p) => p.value)).toEqual(["Alder Gas Co."])
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
    expect(out.groupBy).toBe("pipeline")
    expect(out.sections.find((s) => s.id === ID_A)?.pipelineId).toBe("line-1")
    expect(editionProgress(out)[0]).toMatchObject({ sections: 2, placed: 1 })
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
    const groups = summarise(network, network.editions[1].id)
    expect(groups.map((g) => [g.name, g.sections.map((s) => s.id)])).toEqual([
      ["1931 edition", [ID_A]],
      ["1937 edition", [ID_B]],
    ])
    expect(groups.every((g) => g.kind === "edition" && !g.unassigned)).toBe(
      true
    )
  })
})
