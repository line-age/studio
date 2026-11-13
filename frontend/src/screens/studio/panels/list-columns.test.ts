import { describe, expect, it } from "vitest"

import { isTable, listColumns } from "./list-columns"

const required = ["Owner", "Diameter", "Build date"]

describe("listColumns", () => {
  it("is the plain list at the panel's own width", () => {
    const columns = listColumns(300, required)
    expect(columns).toEqual({ detail: false, bar: false, attributes: [] })
    expect(isTable(columns)).toBe(false)
  })

  it("adds the code and section count first, then the bar", () => {
    expect(listColumns(443, required).detail).toBe(false)
    expect(listColumns(444, required)).toEqual({
      detail: true,
      bar: false,
      attributes: [],
    })
    expect(listColumns(548, required).bar).toBe(true)
  })

  it("adds the required attributes one by one as room allows", () => {
    expect(listColumns(676, required).attributes).toEqual(["Owner"])
    expect(listColumns(804, required).attributes).toEqual(["Owner", "Diameter"])
    expect(listColumns(1200, required).attributes).toEqual(required)
    expect(listColumns(1200, []).attributes).toEqual([])
  })
})
