import { describe, expect, it } from "vitest"

import { editsBundle } from "./write-edits"
import {
  decideMembershipsBundle,
  mergeBundles,
  placeBundle,
  type Bundle,
} from "./write"

/*
 * What write.ts sends, checked against store's own bundle schema (from
 * store's model, kept by the Agent service in agent/contract/), so a field
 * store does not know, or one it needs, fails here and not in store.
 */

const SCHEMAS = import.meta.glob(
  "../../../../agent/contract/store-bundle.schema.json",
  { eager: true, import: "default" }
)
type Schema = {
  $ref?: string
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  anyOf?: Schema[]
  enum?: unknown[]
  const?: unknown
  $defs?: Record<string, Schema>
}
const root = Object.values(SCHEMAS)[0] as Schema

function resolve(schema: Schema): Schema {
  return schema.$ref
    ? resolve(root.$defs![schema.$ref.split("/").at(-1)!])
    : schema
}

/** The places in `value` that `schema` does not allow. */
function problems(value: unknown, at: Schema, path = "bundle"): string[] {
  const schema = resolve(at)
  if (schema.anyOf)
    return schema.anyOf.some((s) => problems(value, s, path).length === 0)
      ? []
      : [`${path}: matches none of its forms`]
  if (schema.enum && !schema.enum.includes(value))
    return [`${path}: ${String(value)} is not one of ${schema.enum.join(", ")}`]
  if (schema.const !== undefined && schema.const !== value)
    return [`${path}: must be ${String(schema.const)}`]
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path}: not a list`]
    return value.flatMap((v, i) => problems(v, schema.items!, `${path}[${i}]`))
  }
  if (schema.type === "object" || schema.properties) {
    if (typeof value !== "object" || value === null)
      return [`${path}: not an object`]
    const known = schema.properties ?? {}
    const record = value as Record<string, unknown>
    return [
      ...Object.keys(record)
        .filter((k) => !(k in known))
        .map((k) => `${path}.${k}: store does not know it`),
      ...(schema.required ?? [])
        .filter((k) => !(k in record))
        .map((k) => `${path}.${k}: store needs it`),
      ...Object.entries(record).flatMap(([k, v]) =>
        k in known ? problems(v, known[k], `${path}.${k}`) : []
      ),
    ]
  }
  return []
}

const bundles: [string, Bundle][] = [
  [
    "make",
    placeBundle([{ id: "s-1", pipelineId: null }], { kind: "new" }, "k"),
  ],
  [
    "move",
    placeBundle(
      [{ id: "s-1", pipelineId: "a", membershipId: "l-1" }],
      { kind: "pipeline", pipelineId: "b" },
      "k"
    ),
  ],
  [
    "take out",
    placeBundle(
      [{ id: "s-1", pipelineId: "a", membershipId: "l-1" }],
      { kind: "none" },
      "k"
    ),
  ],
  ["decide", decideMembershipsBundle(["l-1"], "confirm")],
  [
    "make with a name",
    mergeBundles(
      placeBundle([{ id: "s-1", pipelineId: null }], { kind: "new" }, "k"),
      editsBundle(
        [{ feature: "line", key: "name", label: "Name", value: "Calder" }],
        ""
      )
    ),
  ],
  [
    "a pipeline's sections",
    mergeBundles(
      placeBundle(
        [{ id: "s-2", pipelineId: "b", membershipId: "l-2" }],
        { kind: "pipeline", pipelineId: "a" },
        "k"
      ),
      placeBundle(
        [{ id: "s-1", pipelineId: "a", membershipId: "l-1" }],
        { kind: "none" },
        "k"
      )
    ),
  ],
  [
    "a pipeline's own claims",
    editsBundle(
      [{ feature: "p-1", key: "operator", label: "Operator", value: "Birch" }],
      "why"
    ),
  ],
  [
    "a section's typed value, sent with its action's key",
    editsBundle(
      [{ feature: "s-1", key: "diameter", label: "Diameter", value: "12 in" }],
      "",
      "press-1"
    ),
  ],
]

describe("write.ts against store's bundle schema", () => {
  it("has the schema, with reviews", () => {
    expect(root.properties).toHaveProperty("reviews")
  })

  it.each(bundles)("%s is a bundle store takes", (_, bundle) => {
    expect(problems(bundle, root)).toEqual([])
  })

  it("fails a field store does not know", () => {
    expect(problems({ links: [{ bogus: 1 }] }, root).length).toBeGreaterThan(0)
  })
})
