import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { summarise } from "./derive"
import {
  DEFAULT_REQUIRED,
  ON_PIPELINE,
  groupStatus,
  missingRequired,
  needsDecision,
  sectionStatus,
  statusCounts,
  unknownByAttribute,
} from "./status"

const network = testNetwork()
const [alder, birch, dale, loose] = network.sections
const two = ["Diameter", "Build date"]

describe("sectionStatus", () => {
  it("is Not started when no required attribute is cited", () => {
    expect(sectionStatus(birch, two)).toBe("not-started")
    expect(sectionStatus(loose, two)).toBe("not-started")
  })

  it("is In progress when some are cited and not all", () => {
    // Diameter and Build date are cited; this rule also asks for a material.
    const three = [...two, "Material"]
    expect(sectionStatus(alder, three)).toBe("in-progress")
    expect(missingRequired(alder, three)).toEqual(["Material"])
  })

  it("is Done when all are cited and the section is in a pipeline", () => {
    expect(sectionStatus(alder, two)).toBe("done")
  })

  it("is Sufficient when all are cited and it is in no pipeline", () => {
    expect(sectionStatus({ ...alder, pipelineId: null }, two)).toBe(
      "sufficient"
    )
  })

  it("never asks a section for its owner: that is the pipeline's", () => {
    expect(DEFAULT_REQUIRED).not.toContain("Owner")
    expect(ON_PIPELINE).toContain("Owner")
    expect(sectionStatus(alder)).toBe("done")
  })

  it("asks nothing when the rule is empty", () => {
    expect(sectionStatus(birch, [])).toBe("done")
    expect(sectionStatus(loose, [])).toBe("sufficient")
  })
})

describe("needsDecision", () => {
  it("marks a section with a proposal waiting, whatever its status", () => {
    expect(needsDecision(birch)).toBe(true)
    expect(needsDecision(alder)).toBe(false)
    // A pipeline proposed for the section waits for a decision too.
    expect(needsDecision(loose)).toBe(true)
    expect(needsDecision({ ...loose, proposedMemberships: [] })).toBe(false)
  })
})

describe("counts", () => {
  const sections = [alder, birch, dale, loose]

  it("add up to the number of sections", () => {
    const counts = statusCounts(sections, two)
    expect(counts).toEqual({
      "not-started": 2,
      "in-progress": 0,
      sufficient: 0,
      done: 2,
    })
  })

  it("change when the rule changes", () => {
    const more = [...two, "Material"]
    expect(statusCounts(sections, more).done).toBe(0)
    expect(statusCounts(sections, more)["in-progress"]).toBe(2)
  })

  it("say how many sections have each required attribute Unknown", () => {
    expect(unknownByAttribute(sections, two)).toEqual({
      Diameter: 2,
      "Build date": 2,
    })
  })
})

describe("groupStatus", () => {
  const counts = (
    notStarted: number,
    inProgress: number,
    sufficient: number,
    done: number
  ) => ({
    "not-started": notStarted,
    "in-progress": inProgress,
    sufficient,
    done,
  })

  it("is Done only when every section is done", () => {
    expect(groupStatus(counts(0, 0, 0, 3))).toBe("done")
    expect(groupStatus(counts(1, 0, 0, 2))).toBe("in-progress")
  })

  it("is Not started when none has begun, or there are none", () => {
    expect(groupStatus(counts(3, 0, 0, 0))).toBe("not-started")
    expect(groupStatus(counts(0, 0, 0, 0))).toBe("not-started")
  })

  it("is Sufficient when every section is, outside a pipeline", () => {
    expect(groupStatus(counts(0, 0, 2, 0))).toBe("sufficient")
  })
})

describe("summarise", () => {
  it("gives every pipeline its status, done count and Unknown counts", () => {
    const [north, south] = summarise(network, two)
    expect(north).toMatchObject({
      status: "in-progress",
      done: 1,
      needsDecision: true,
      unknownByAttribute: { Diameter: 1, "Build date": 1 },
    })
    // Its old route, on the 1931 map only, has not been started.
    expect(south).toMatchObject({ status: "in-progress", done: 1 })
  })
})
