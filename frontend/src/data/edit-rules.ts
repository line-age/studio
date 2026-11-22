import { z } from "zod"

import contract from "./attribute-rules.json"

/*
 * What a claim's value may be, and so what a person can type in Edit:
 * `attribute-rules.json`, Studio's one rules file. It is store's attribute
 * registry (value type, enum words, feature kinds, networks; store's
 * `lineage_model.ATTRIBUTES`) plus limits store does not enforce yet: a
 * quantity's units and its lower bound. The Agent service checks its
 * proposals against the same file (`agent/contract/attribute-rules.json`; a
 * test keeps the two copies equal). Change both copies together, and follow
 * store's registry when it changes. Every check of a typed value goes
 * through here.
 */

const ruleSchema = z.object({
  key: z.string(),
  value_type: z.enum(["text", "quantity", "enum", "geometry", "feature"]),
  cardinality: z.enum(["one", "many"]),
  feature_kinds: z.array(z.string()),
  networks: z.array(z.string()).nullable(),
  enum_values: z.array(z.string()).nullable(),
  units: z.array(z.string()).nullable(),
  min_value: z.number().nullable(),
})

/** One attribute as store's registry has it. */
export type AttributeRule = z.infer<typeof ruleSchema>

const RULES: ReadonlyMap<string, AttributeRule> = new Map(
  z
    .object({ attributes: z.array(ruleSchema) })
    .parse(contract)
    .attributes.map((rule) => [rule.key, rule])
)

/** Store's rule for an attribute key, if store has one. */
export function ruleFor(key: string): AttributeRule | undefined {
  return RULES.get(key)
}

/** A value as a claim carries it in a bundle. */
export type StoreValue =
  { value_text: string } | { value_num: number; value_unit: string | null }

/**
 * Whether a person can type this attribute's value. A geometry is drawn and
 * a feature is picked, never typed; an enum is chosen from store's words,
 * which Edit has no control for yet.
 */
export function isTyped(rule: AttributeRule): boolean {
  return rule.value_type === "text" || rule.value_type === "quantity"
}

/** Whether the rule lets a claim sit on this kind of feature in this network. */
export function appliesTo(
  rule: AttributeRule,
  feature: { kind: string; network?: string }
): boolean {
  return (
    rule.feature_kinds.includes(feature.kind) &&
    (rule.networks === null ||
      feature.network === undefined ||
      rule.networks.includes(feature.network))
  )
}

const NUMBER_AND_UNIT = /^(-?\d+(?:\.\d+)?)\s*(.*)$/

function quantitySchema(rule: AttributeRule) {
  const example = `12${rule.units ? ` ${rule.units[0]}` : ""}`
  return z
    .string()
    .trim()
    .transform((text, ctx) => {
      const match = NUMBER_AND_UNIT.exec(text)
      if (!match) {
        ctx.addIssue({
          code: "custom",
          message: `Give a number${rule.units ? " and a unit" : ""}, like ${example}.`,
        })
        return z.NEVER
      }
      const unit = match[2].trim() || null
      if (rule.units && (unit === null || !rule.units.includes(unit))) {
        ctx.addIssue({
          code: "custom",
          message: `Give the unit: ${rule.units.join(" or ")}.`,
        })
        return z.NEVER
      }
      const value = Number(match[1])
      if (rule.min_value !== null && value <= rule.min_value) {
        ctx.addIssue({
          code: "custom",
          message: `Must be more than ${rule.min_value}.`,
        })
        return z.NEVER
      }
      return { value_num: value, value_unit: unit }
    })
}

/**
 * The zod schema for what a person types for one attribute: it parses the
 * text into the value store takes, or fails with words to show under the
 * field. Undefined when the value is not typed (see `isTyped`).
 */
export function typedValueSchema(
  rule: AttributeRule
): z.ZodType<StoreValue, string> | undefined {
  if (rule.value_type === "quantity") return quantitySchema(rule)
  if (rule.value_type === "text") {
    return z
      .string()
      .trim()
      .min(1, "Give a value.")
      .transform((text) => ({ value_text: text }))
  }
  return undefined
}

/** What typed text comes to for an attribute key: its value, or why not. */
export function readTyped(
  key: string,
  text: string
): { ok: true; value: StoreValue } | { ok: false; message: string } {
  const rule = ruleFor(key)
  const schema = rule && typedValueSchema(rule)
  if (!schema) return { ok: false, message: `${key} is not typed.` }
  const result = schema.safeParse(text)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, message: result.error.issues[0].message }
}
