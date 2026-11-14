import { describe, expect, it } from "vitest"

import { shortId } from "./short-id"

describe("a feature's short name", () => {
  it("is the same hash the Agent computes", () => {
    // agent/tests/test_ref_labels.py pins the same value.
    expect(shortId("01a1a923-2283-41d1-7a93-9a959dcd3f22")).toBe(SAME_AS_AGENT)
  })

  it("names sections of one import, side by side, quite differently", () => {
    const a = shortId("01a1a923-2283-41d1-7a93-9a959dcd3f22")
    const b = shortId("01a1a923-2283-41d1-7a93-9a959dcd3f23")
    expect(a).not.toBe(b)
    expect(a.slice(0, 4)).not.toBe(b.slice(0, 4))
  })
})

const SAME_AS_AGENT = "114d686e"
