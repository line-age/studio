import { describe, expect, it, beforeEach } from "vitest"

import type { Claim } from "@/data/schema"

import { useStudio } from "../studio-store"

/*
 * openCitation/closeCitation/stepClaim are pure store logic: no DOM needed.
 * Citations here are invented, never real store data.
 */

const cited = (attribute: string): Claim => ({
  attribute,
  value: "a value",
  citations: [{ source: "A source" }],
  proposals: [],
})

const uncited = (attribute: string): Claim => ({
  attribute,
  value: null,
  citations: [],
  proposals: [],
})

beforeEach(() => {
  useStudio.setState({ openedCitation: null })
})

describe("openCitation / closeCitation", () => {
  it("opens a citation at a section, claim and index, and closes it", () => {
    useStudio.getState().openCitation("s-1", "Geometry", 2)
    expect(useStudio.getState().openedCitation).toEqual({
      sectionId: "s-1",
      attribute: "Geometry",
      citationIndex: 2,
    })
    useStudio.getState().closeCitation()
    expect(useStudio.getState().openedCitation).toBeNull()
  })

  it("opens the first citation when none is given", () => {
    useStudio.getState().openCitation("s-1", "Status")
    expect(useStudio.getState().openedCitation?.citationIndex).toBe(0)
  })
})

describe("stepClaim", () => {
  it("moves to the next or previous cited claim, selecting its first citation", () => {
    const claims = [cited("Geometry"), cited("Status"), cited("First seen")]
    useStudio.getState().openCitation("s-1", "Geometry", 1)
    useStudio.getState().stepClaim(claims, 1)
    expect(useStudio.getState().openedCitation).toEqual({
      sectionId: "s-1",
      attribute: "Status",
      citationIndex: 0,
    })
    useStudio.getState().stepClaim(claims, -1)
    expect(useStudio.getState().openedCitation?.attribute).toBe("Geometry")
  })

  it("skips a claim with no citation", () => {
    const claims = [cited("Geometry"), uncited("Status"), cited("First seen")]
    useStudio.getState().openCitation("s-1", "Geometry", 0)
    useStudio.getState().stepClaim(claims, 1)
    expect(useStudio.getState().openedCitation?.attribute).toBe("First seen")
  })

  it("does nothing past the first or last cited claim", () => {
    const claims = [cited("Geometry"), cited("Status")]
    useStudio.getState().openCitation("s-1", "Geometry", 0)
    useStudio.getState().stepClaim(claims, -1)
    expect(useStudio.getState().openedCitation?.attribute).toBe("Geometry")
    useStudio.getState().openCitation("s-1", "Status", 0)
    useStudio.getState().stepClaim(claims, 1)
    expect(useStudio.getState().openedCitation?.attribute).toBe("Status")
  })

  it("never changes the selected attribute, only the open citation", () => {
    useStudio.setState({ selectedAttribute: "Diameter" })
    const claims = [cited("Geometry"), cited("Status")]
    useStudio.getState().openCitation("s-1", "Geometry", 0)
    useStudio.getState().stepClaim(claims, 1)
    expect(useStudio.getState().selectedAttribute).toBe("Diameter")
  })
})
