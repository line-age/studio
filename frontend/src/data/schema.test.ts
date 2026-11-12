import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import sample from "../../public/fixtures/sample.json"
import { FixtureError, parseNetwork } from "./schema"

const detailOf = (input: unknown): string => {
  try {
    parseNetwork(input)
  } catch (error) {
    if (error instanceof FixtureError) return error.detail
    throw error
  }
  throw new Error("expected the fixture to be rejected")
}

describe("parseNetwork", () => {
  it("accepts the sample fixture that ships with the app", () => {
    const network = parseNetwork(sample)
    expect(network.pipelines.length).toBeGreaterThan(0)
    expect(network.sections.length).toBeGreaterThan(0)
  })

  it("fills in the optional lists", () => {
    const network = testNetwork()
    expect(network.notes).toEqual([])
    expect(network.sections[0].claims[0].proposals).toEqual([])
    expect(network.sections[0].changedSinceReview).toBe(false)
  })

  it("rejects a value that has no citation", () => {
    const input = structuredClone(testNetwork())
    input.sections[0].claims[0].citations = []
    expect(detailOf(input)).toContain("A value needs at least one citation")
  })

  it("rejects citations on an Unknown claim", () => {
    const input = structuredClone(testNetwork())
    input.sections[3].claims[0].citations = [{ source: "1937 edition" }]
    expect(detailOf(input)).toContain("cannot carry citations")
  })

  it("rejects a section that points at a missing pipeline or edition", () => {
    const input = structuredClone(testNetwork())
    input.sections[0].pipelineId = "p-missing"
    input.sections[1].editionIds = ["ed-missing"]
    const detail = detailOf(input)
    expect(detail).toContain('No pipeline with id "p-missing"')
    expect(detail).toContain('No edition with id "ed-missing"')
  })

  it("rejects duplicate ids", () => {
    const input = structuredClone(testNetwork())
    input.sections[1].id = input.sections[0].id
    expect(detailOf(input)).toContain("Duplicate id")
  })

  it("rejects something that is not a network at all", () => {
    expect(() => parseNetwork({ hello: "world" })).toThrow(FixtureError)
  })
})
