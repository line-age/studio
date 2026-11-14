import { describe, expect, it } from "vitest"

import type { AgentAnswerRef } from "./answer"
import { refTitle } from "./ref-title"

/*
 * A reference's chip names what it opens. Studio lists sections and
 * pipelines; anything else goes by the name the service read, never by a
 * guess such as "Pipeline".
 */

const SECTION = "11111111-1111-4111-8111-111111111111"
const TRACE = "22222222-2222-4222-8222-222222222222"
const studio = (id: string) => (id === SECTION ? "Birch to Cedar" : null)

describe("a reference's chip", () => {
  it("names a section Studio lists by Studio's name", () => {
    const ref: AgentAnswerRef = { type: "feature", id: SECTION, label: "x" }
    expect(refTitle(ref, studio)).toEqual({
      title: "Birch to Cedar",
      meta: "Read in store",
    })
  })

  it("names a claim on a merged trace by what the service read", () => {
    const ref: AgentAnswerRef = {
      type: "claim",
      id: "c",
      feature_id: TRACE,
      attribute: "owner",
      status: "accepted",
      label: "trace 22222222, merged into Birch to Cedar",
    }
    expect(refTitle(ref, studio)).toEqual({
      title: "Owner",
      meta: "Cited · trace 22222222, merged into Birch to Cedar",
    })
  })

  it("names a line traced as gone, and a link by what it says", () => {
    expect(
      refTitle(
        { type: "feature", id: TRACE, label: "line traced as gone 22222222" },
        studio
      ).title
    ).toBe("line traced as gone 22222222")
    expect(
      refTitle(
        {
          type: "link",
          id: "k",
          status: "proposed",
          label: "End, traced as gone",
        },
        studio
      )
    ).toEqual({ title: "End, traced as gone", meta: "Proposed" })
  })

  it("never guesses a kind when nothing names it", () => {
    const { title } = refTitle({ type: "feature", id: TRACE }, studio)
    expect(title).toBe("feature 22222222")
  })
})
