import { describe, expect, it } from "vitest"

import { addKeyName, holdsAddKey, mapClick } from "./click-selection"

describe("mapClick", () => {
  it("selects one section on a plain click, whatever is selected", () => {
    expect(mapClick({ onSection: true, addKey: false, empty: true })).toBe(
      "select-one"
    )
    expect(mapClick({ onSection: true, addKey: false, empty: false })).toBe(
      "select-one"
    )
  })

  it("adds or takes off with the add key held", () => {
    expect(mapClick({ onSection: true, addKey: true, empty: false })).toBe(
      "toggle"
    )
  })

  it("opens the first section of a set as a single selection", () => {
    expect(mapClick({ onSection: true, addKey: true, empty: true })).toBe(
      "select-one"
    )
  })

  it("steps back on empty map, but not with the add key held", () => {
    expect(mapClick({ onSection: false, addKey: false, empty: false })).toBe(
      "step-back"
    )
    expect(mapClick({ onSection: false, addKey: true, empty: false })).toBe(
      "nothing"
    )
  })
})

describe("the add key", () => {
  it("is Cmd on a Mac, where Ctrl is a right click", () => {
    expect(addKeyName(true)).toBe("Cmd")
    expect(holdsAddKey({ metaKey: true, ctrlKey: false }, true)).toBe(true)
    expect(holdsAddKey({ metaKey: false, ctrlKey: true }, true)).toBe(false)
  })

  it("is Ctrl elsewhere", () => {
    expect(addKeyName(false)).toBe("Ctrl")
    expect(holdsAddKey({ metaKey: false, ctrlKey: true }, false)).toBe(true)
    expect(holdsAddKey({ metaKey: true, ctrlKey: false }, false)).toBe(false)
  })
})
