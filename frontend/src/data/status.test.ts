import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { summarise } from "./derive"
import {
  groupStatus,
  missingRequired,
  needsDecision,
  sectionStatus,
  statusCounts,
  unknownByAttribute,
} from "./status"

const network = testNetwork()
const [alder, birch, dale, loose] = network.sections
const two = ["Owner", "Diameter"]

describe("sectionStatus", () => {
  it("is Not started when no required attribute is cited", () => {
    expect(sectionStatus(birch, two)).toBe("not-started")
    expect(sectionStatus(loose, two)).toBe("not-started")
  })

  it("is In progress when some are cited and not all", () => {
    // Owner and Diameter are cited; the default rule also asks Build date.
    expect(sectionStatus(alder)).toBe("in-progress")
    expect(missingRequired(alder, ["Owner", "Diameter", "Build date"])).toEqual(
      ["Build date"]
    )
  })

  it("is Done when all are cited and the section is in a pipeline", () => {
    expect(sectionStatus(alder, two)).toBe("done")
  })

  it("is Sufficient when all are cited and it is in no pipeline", () => {
    expect(sectionStatus({ ...alder, pipelineId: null }, two)).toBe(
      "sufficient"
    )
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
    expect(statusCounts(sections).done).toBe(0)
    expect(statusCounts(sections)["in-progress"]).toBe(2)
  })

  it("say how many sections have each required attribute Unknown", () => {
    expect(unknownByAttribute(sections, two)).toEqual({ Owner: 2, Diameter: 2 })
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
    const [north, south] = summarise(network, "ed-1937", two)
    expect(north).toMatchObject({
      status: "in-progress",
      done: 1,
      needsDecision: true,
      unknownByAttribute: { Owner: 1, Diameter: 1 },
    })
    expect(south).toMatchObject({ status: "done", done: 1 })
  })
})
