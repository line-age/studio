import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { formatLength, NO_PIPELINE, sectionFacts } from "./section-facts"
import { parseNetwork } from "./schema"

const network = testNetwork()
const section = (id: string) => network.sections.find((s) => s.id === id)!
const value = (id: string, label: string) =>
  sectionFacts(section(id), network).facts.find((f) => f.label === label)?.value

describe("sectionFacts", () => {
  it("says a named section's name, its code and its pipeline with its code", () => {
    const facts = sectionFacts(section("s-1"), network)
    expect(facts.title).toBe("Alder to Birch")
    expect(facts.code).toBe("S-0001")
    expect(facts.pipeline).toBe("North line · P-001")
    expect(facts.facts.map((f) => f.label)).toEqual([
      "Owner",
      "Diameter",
      "First seen",
      "Last seen",
      "Length",
    ])
  })

  it("takes the owner from the pipeline, every owner it had", () => {
    expect(value("s-1", "Owner")).toBe("Alder Gas Co., Yew Fuel Co.")
  })

  it("leaves the owner Unknown when the pipeline's is, and with no pipeline", () => {
    expect(value("s-3", "Owner")).toBeNull()
    expect(value("s-4", "Owner")).toBeNull()
  })

  it("says in no pipeline for a section only proposed for one", () => {
    expect(sectionFacts(section("s-4"), network).pipeline).toBe(NO_PIPELINE)
  })

  it("gives a cited value and leaves an Unknown one null", () => {
    expect(value("s-1", "Diameter")).toBe("12 in")
    expect(value("s-5", "Diameter")).toBeNull()
  })

  it("never shows a proposed value as the value: it counts it as waiting", () => {
    const facts = sectionFacts(section("s-2"), network)
    expect(value("s-2", "Diameter")).toBeNull()
    expect(facts.proposals).toBe(1)
    expect(sectionFacts(section("s-1"), network).proposals).toBe(0)
  })

  it("works the length out from the traced line", () => {
    // One degree of longitude at 10 degrees north.
    expect(value("s-1", "Length")).toBe("110 km")
  })

  it("goes by the code and says Name is Unknown when no source names the section or its pipeline", () => {
    const unnamed = parseNetwork({
      version: 1,
      name: "Unnamed",
      editions: [{ id: "ed-1", year: 1931, label: "1931 edition" }],
      pipelines: [
        {
          id: "p-1",
          code: "P-001",
          name: null,
          // The owner was looked for and not found: still Unknown.
          claims: [{ attribute: "Owner", value: null }],
        },
      ],
      sections: [
        {
          id: "s-1",
          code: "S-0001",
          name: null,
          pipelineId: "p-1",
          editionIds: ["ed-1"],
          claims: [{ attribute: "Diameter", value: null }],
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [0.01, 0],
            ],
          },
        },
      ],
    })
    const facts = sectionFacts(unnamed.sections[0], unnamed)
    expect(facts.title).toBe("S-0001")
    expect(facts.code).toBeNull()
    expect(facts.pipeline).toBe("P-001")
    expect(facts.facts[0]).toEqual({ label: "Name", value: null })
    expect(facts.facts[1]).toEqual({ label: "Owner", value: null })
  })
})

describe("formatLength", () => {
  it("keeps one decimal under ten km and none from there", () => {
    expect(formatLength(0.84)).toBe("0.8 km")
    expect(formatLength(9.96)).toBe("10.0 km")
    expect(formatLength(27.4)).toBe("27 km")
    expect(formatLength(1234.5)).toBe("1,235 km")
  })
})
