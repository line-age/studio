import { describe, expect, it } from "vitest"

import { DEFAULT_LINE_STYLE } from "../settings"
import { legendText, statusesDrawn } from "./line-style"

describe("map lines by status", () => {
  it("draws sufficient and done solid, the rest dotted, by default", () => {
    expect(statusesDrawn(DEFAULT_LINE_STYLE, "solid")).toEqual([
      "sufficient",
      "done",
    ])
    expect(legendText(DEFAULT_LINE_STYLE, "solid")).toBe("Sufficient or done")
    expect(legendText(DEFAULT_LINE_STYLE, "dotted")).toBe(
      "Not started or in progress"
    )
  })

  it("words the key from the setting, whatever is chosen", () => {
    const all = {
      ...DEFAULT_LINE_STYLE,
      "not-started": "solid",
      "in-progress": "solid",
    } as const
    expect(legendText(all, "solid")).toBe(
      "Not started or in progress or sufficient or done"
    )
    expect(legendText(all, "dotted")).toBe("No status")
  })
})
