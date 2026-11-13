import { describe, expect, it } from "vitest"

import { statesOf } from "./us-states"

describe("statesOf", () => {
  it("places a line inside one state", () => {
    expect(
      statesOf({
        type: "LineString",
        coordinates: [
          [-84.39, 33.75],
          [-83.63, 32.84],
        ],
      })
    ).toEqual(["Georgia"])
  })

  it("finds every state a line crosses, between its points too", () => {
    // Two points far apart: Georgia is crossed only between them.
    expect(
      statesOf({
        type: "LineString",
        coordinates: [
          [-86.8, 33.5],
          [-81.0, 34.0],
        ],
      })
    ).toEqual(["Alabama", "Georgia", "South Carolina"])
  })

  it("places nothing off the map of the states", () => {
    expect(
      statesOf({
        type: "MultiLineString",
        coordinates: [
          [
            [-40, 30],
            [-39, 31],
          ],
        ],
      })
    ).toEqual([])
  })
})
