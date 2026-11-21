import { describe, expect, it } from "vitest"

import { editionRows, inScope, NO_CRITERIA, type Scope } from "@/data/derive"
import { testNetwork } from "@/test/network"

import { sectionFeatures } from "./section-features"

const network = testNetwork()
const scoped = (scope: Scope) =>
  editionRows(
    network,
    NO_CRITERIA.rule,
    network.sections.filter((s) => inScope(s, scope))
  )
const ids = (features: { properties: { id: string } }[]) =>
  features.map((f) => f.properties.id).sort()

describe("what the map is given to draw", () => {
  it("draws every section on All, heavy in a pipeline and thin in none", () => {
    const { drawn, faint } = sectionFeatures(scoped("all"), NO_CRITERIA)
    expect(ids(drawn)).toEqual(["s-1", "s-2", "s-3", "s-4", "s-5"])
    expect(faint).toEqual([])
    const placed = Object.fromEntries(
      drawn.map((f) => [f.properties.id, f.properties.placed])
    )
    // s-4 is only proposed for a pipeline: still thin.
    expect(placed).toEqual({
      "s-1": true,
      "s-2": true,
      "s-3": true,
      "s-4": false,
      "s-5": true,
    })
  })

  it("leaves what the switch hides out of the map altogether", () => {
    const pipelines = sectionFeatures(scoped("pipelines"), NO_CRITERIA)
    expect(ids(pipelines.drawn)).toEqual(["s-1", "s-2", "s-3", "s-5"])
    const unplaced = sectionFeatures(scoped("unplaced"), NO_CRITERIA)
    expect(ids(unplaced.drawn)).toEqual(["s-4"])
    // Not faint either: a hidden line has nothing on the map to click.
    expect(pipelines.faint).toEqual([])
    expect(unplaced.faint).toEqual([])
  })

  it("makes faint only what the filters leave out of what the switch shows", () => {
    const { drawn, faint } = sectionFeatures(scoped("pipelines"), {
      ...NO_CRITERIA,
      changedOnly: true,
    })
    expect(ids(drawn)).toEqual(["s-2"])
    expect(ids(faint)).toEqual(["s-1", "s-3", "s-5"])
    // A faint line carries no status and no pipeline: it only shows.
    expect(Object.keys(faint[0].properties)).toEqual(["id"])
  })
})
