import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  readSettings,
  useSettings,
} from "./settings"

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  localStorage.clear()
})

describe("settings", () => {
  it("opens on the defaults when the browser holds nothing", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it("falls back to the defaults on a value it cannot read", () => {
    localStorage.setItem(SETTINGS_KEY, "{not json")
    expect(readSettings()).toEqual(DEFAULT_SETTINGS)
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ requiredAttributes: "Owner", lineStyle: {} })
    )
    expect(readSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it("keeps a change in the browser", () => {
    useSettings.getState().toggleRequired("Build date")
    expect(useSettings.getState().requiredAttributes).toEqual([
      "Owner",
      "Diameter",
    ])
    expect(readSettings().requiredAttributes).toEqual(["Owner", "Diameter"])

    useSettings.getState().setLineStyle("in-progress", "solid")
    expect(readSettings().lineStyle["in-progress"]).toBe("solid")
  })

  it("never puts an attribute every section has into the rule", () => {
    useSettings.getState().toggleRequired("Geometry")
    expect(useSettings.getState().requiredAttributes).not.toContain("Geometry")
  })
})
