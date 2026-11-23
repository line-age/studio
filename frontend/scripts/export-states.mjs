// Writes the US state outlines Studio uses (src/data/us-states.ts) for the Agent, so
// both place a section in the same states: ../agent/data/us-states.json.
// `node scripts/export-states.mjs --check` fails when that file is stale.
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { feature } from "topojson-client"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, "../../agent/data/us-states.json")
const topology = require("us-atlas/states-10m.json")
const { version } = require("us-atlas/package.json")

const states = feature(topology, topology.objects.states)
  .features.filter((f) => f.properties && f.geometry)
  .map((f) => ({
    name: f.properties.name,
    polygons:
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const text =
  JSON.stringify({
    source: `us-atlas ${version} states-10m (US Census Bureau cartographic boundaries, public domain)`,
    made_by: "frontend/scripts/export-states.mjs",
    states,
  }) + "\n"

if (process.argv.includes("--check")) {
  let now = ""
  try {
    now = readFileSync(out, "utf8")
  } catch {
    // missing: stale
  }
  if (now !== text) {
    console.error("agent/data/us-states.json is stale: run pnpm states:export")
    process.exit(1)
  }
  console.log("agent/data/us-states.json matches Studio's outlines")
} else {
  writeFileSync(out, text)
  console.log(`wrote ${out} (${states.length} states)`)
}
