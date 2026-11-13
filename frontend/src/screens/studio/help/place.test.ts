import { describe, expect, it } from "vitest"

import { cardPosition, ringBox } from "./place"

const viewport = { width: 1728, height: 1000 }
const card = { width: 320, height: 160 }

describe("ringBox", () => {
  it("stands a little off the area", () => {
    expect(
      ringBox({ left: 100, top: 100, width: 50, height: 20 }, viewport)
    ).toEqual({ left: 96, top: 96, width: 58, height: 28 })
  })

  it("stays inside the window for an area that reaches its edge", () => {
    expect(
      ringBox({ left: 64, top: 42, width: 300, height: 958 }, viewport)
    ).toEqual({ left: 60, top: 38, width: 308, height: 958 })
  })
})

describe("cardPosition", () => {
  it("sits in the middle when the step has no area", () => {
    expect(cardPosition(null, card, viewport)).toEqual({ left: 704, top: 420 })
  })

  it("sits to the right of the area when there is room", () => {
    const ring = { left: 60, top: 38, width: 308, height: 958 }
    expect(cardPosition(ring, card, viewport)).toEqual({ left: 380, top: 38 })
  })

  it("goes to the left when the right has no room", () => {
    const ring = { left: 1363, top: 38, width: 361, height: 958 }
    expect(cardPosition(ring, card, viewport)).toEqual({ left: 1031, top: 38 })
  })

  it("goes below an area that spans the width", () => {
    const ring = { left: 4, top: 4, width: 1720, height: 42 }
    expect(cardPosition(ring, card, viewport)).toEqual({ left: 16, top: 58 })
  })

  it("goes inside an area that leaves no room on any side", () => {
    const ring = { left: 4, top: 4, width: 1720, height: 992 }
    expect(cardPosition(ring, card, viewport)).toEqual({ left: 20, top: 20 })
  })

  it("keeps the card inside the window beside a low area", () => {
    const ring = { left: 700, top: 950, width: 100, height: 40 }
    expect(cardPosition(ring, card, viewport)).toEqual({ left: 812, top: 824 })
  })
})
