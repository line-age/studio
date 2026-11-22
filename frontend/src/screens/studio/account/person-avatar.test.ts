import { describe, expect, it } from "vitest"

import { initials } from "./person-avatar"

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ada Example")).toBe("AE")
    expect(initials("ada mid example")).toBe("AE")
  })

  it("takes one letter from one word, and nothing from nothing", () => {
    expect(initials("ada")).toBe("A")
    expect(initials("  ")).toBe("")
  })
})
