import { describe, expect, it } from "vitest"

import {
  appliesTo,
  isTyped,
  readTyped,
  ruleFor,
  typedValueSchema,
} from "./edit-rules"
import frontendCopy from "./attribute-rules.json"

/*
 * Studio's rules for a value. The same file is the Agent's
 * (agent/contract/); the first test keeps the two copies one.
 */

const AGENT_COPY = import.meta.glob(
  "../../../agent/contract/attribute-rules.json",
  { eager: true, import: "default" }
)

describe("the rules file", () => {
  it("is the same file the Agent checks its proposals against", () => {
    const agentCopy = Object.values(AGENT_COPY)[0]
    expect(agentCopy).toBeDefined()
    expect(frontendCopy).toEqual(agentCopy)
  })

  it("holds store's registry: diameter, status and route as store has them", () => {
    expect(ruleFor("diameter")).toMatchObject({
      value_type: "quantity",
      cardinality: "one",
      units: ["in", "mm"],
      min_value: 0,
    })
    expect(ruleFor("status")?.enum_values).toContain("operational")
    expect(ruleFor("route")?.value_type).toBe("geometry")
    expect(ruleFor("nonsense")).toBeUndefined()
  })
})

describe("what can be typed, and where", () => {
  it("types text and quantities, never a line, a feature or one of store's words", () => {
    expect(isTyped(ruleFor("diameter")!)).toBe(true)
    expect(isTyped(ruleFor("owner")!)).toBe(true)
    expect(isTyped(ruleFor("route")!)).toBe(false)
    expect(isTyped(ruleFor("serves")!)).toBe(false)
    expect(isTyped(ruleFor("status")!)).toBe(false)
  })

  it("puts a claim only on a feature kind and network store allows", () => {
    const diameter = ruleFor("diameter")!
    expect(appliesTo(diameter, { kind: "section", network: "gas" })).toBe(true)
    expect(appliesTo(diameter, { kind: "section", network: "electric" })).toBe(
      false
    )
    expect(appliesTo(diameter, { kind: "line", network: "gas" })).toBe(false)
    expect(appliesTo(diameter, { kind: "section" })).toBe(true)
    expect(appliesTo(ruleFor("name")!, { kind: "line", network: "any" })).toBe(
      true
    )
  })
})

describe("reading a typed diameter", () => {
  it("takes a number and a unit store allows", () => {
    expect(readTyped("diameter", "12 in")).toEqual({
      ok: true,
      value: { value_num: 12, value_unit: "in" },
    })
    expect(readTyped("diameter", " 610mm ")).toEqual({
      ok: true,
      value: { value_num: 610, value_unit: "mm" },
    })
    expect(readTyped("diameter", "8.625 in")).toEqual({
      ok: true,
      value: { value_num: 8.625, value_unit: "in" },
    })
  })

  it("says what is wrong, in words for under the field", () => {
    expect(readTyped("diameter", "about 12")).toEqual({
      ok: false,
      message: "Give a number and a unit, like 12 in.",
    })
    expect(readTyped("diameter", "12")).toEqual({
      ok: false,
      message: "Give the unit: in or mm.",
    })
    expect(readTyped("diameter", "12 parsecs")).toEqual({
      ok: false,
      message: "Give the unit: in or mm.",
    })
    expect(readTyped("diameter", "0 in")).toEqual({
      ok: false,
      message: "Must be more than 0.",
    })
    expect(readTyped("diameter", "-4 in")).toEqual({
      ok: false,
      message: "Must be more than 0.",
    })
  })
})

describe("reading typed text", () => {
  it("trims it, and refuses nothing at all", () => {
    expect(readTyped("owner", "  Alder Gas Co. ")).toEqual({
      ok: true,
      value: { value_text: "Alder Gas Co." },
    })
    expect(readTyped("owner", "   ")).toEqual({
      ok: false,
      message: "Give a value.",
    })
  })

  it("has no schema for a value that is not typed", () => {
    expect(typedValueSchema(ruleFor("route")!)).toBeUndefined()
    expect(readTyped("route", "Traced line")).toEqual({
      ok: false,
      message: "route is not typed.",
    })
  })
})
