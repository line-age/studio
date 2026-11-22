import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { LINE_WEIGHT, LineKey } from "./line-key"

const stroke = (kind: Parameters<typeof LineKey>[0]["kind"]) =>
  render(<LineKey kind={kind} />)
    .container.querySelector("path")
    ?.getAttribute("stroke-width")

describe("LineKey", () => {
  it("draws heavy and thin as heavy as the map draws placed and unplaced", () => {
    expect(stroke("heavy")).toBe(String(LINE_WEIGHT.placed))
    expect(stroke("thin")).toBe(String(LINE_WEIGHT.unplaced))
    expect(LINE_WEIGHT.placed).toBeGreaterThan(LINE_WEIGHT.unplaced)
  })

  it("keeps the other kinds as they were", () => {
    expect(stroke("solid")).toBe("2")
    expect(stroke("dotted")).toBe("2.5")
    expect(stroke("ghost")).toBe("1")
    expect(stroke("selected")).toBe("4")
  })
})
