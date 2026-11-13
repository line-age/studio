import { describe, expect, it } from "vitest"

import { HELP_STEPS, HELP_WORDS } from "./steps"

const texts = [
  ...HELP_STEPS.flatMap((step) => [step.title, step.body]),
  ...HELP_WORDS.flatMap((word) => [word.term, word.meaning]),
]

describe("the words of Help", () => {
  it("says claim, never fact", () => {
    for (const text of texts) expect(text).not.toMatch(/\bfacts?\b/i)
  })

  it("uses no dash as a separator", () => {
    for (const text of texts) expect(text).not.toMatch(/[–—]| - /)
  })

  it("says plainly that the Agent does not answer yet", () => {
    const agent = HELP_STEPS.find((step) => step.id === "agent")
    expect(agent?.body).toMatch(/does not answer yet/)
  })

  it("has one id per step", () => {
    const ids = HELP_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
