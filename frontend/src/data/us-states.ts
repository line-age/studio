import type { FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { feature } from "topojson-client"
import states from "us-atlas/states-10m.json"

import type { Geometry } from "./schema"

/*
 * Which US states a section runs through, for the State filter. The outlines
 * are the Census Bureau's 1:10m cartographic boundaries as us-atlas ships
 * them, in longitude and latitude. A line is placed by its points and by
 * points along it at most STEP degrees apart, so a short crossing of a
 * corner can be missed; at these maps' accuracy that is noise. This is where
 * a line lies, not a claim about it: it needs no citation.
 */

type Ring = readonly (readonly number[])[]

interface State {
  name: string
  /** west, south, east, north */
  bounds: [number, number, number, number]
  /** Each polygon: its outer ring, then its holes. */
  polygons: Ring[][]
}

/** The furthest apart two tested points along a line are, in degrees. */
const STEP = 0.05

let cache: State[] | null = null

function load(): State[] {
  if (cache) return cache
  type Topo = Parameters<typeof feature>[0]
  type Obj = Parameters<typeof feature>[1]
  const topology = states as unknown as Topo & { objects: { states: Obj } }
  const collection = feature(
    topology,
    topology.objects.states
  ) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>
  const loaded: State[] = collection.features.flatMap((f) => {
    const g = f.geometry
    const polygons =
      g.type === "Polygon"
        ? [g.coordinates as Ring[]]
        : g.type === "MultiPolygon"
          ? (g.coordinates as Ring[][])
          : []
    if (polygons.length === 0 || !f.properties) return []
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const polygon of polygons) {
      for (const [lon, lat] of polygon[0]) {
        west = Math.min(west, lon)
        east = Math.max(east, lon)
        south = Math.min(south, lat)
        north = Math.max(north, lat)
      }
    }
    return [
      {
        name: f.properties.name,
        bounds: [west, south, east, north] as State["bounds"],
        polygons,
      },
    ]
  })
  cache = loaded
  return loaded
}

/** Even-odd ray casting. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

function stateAt(lon: number, lat: number, all: State[]): string | null {
  for (const state of all) {
    const [w, s, e, n] = state.bounds
    if (lon < w || lon > e || lat < s || lat > n) continue
    for (const [outer, ...holes] of state.polygons) {
      if (inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))) {
        return state.name
      }
    }
  }
  return null
}

function lines(geometry: Geometry): readonly (readonly number[])[][] {
  return geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.coordinates
}

/** The states a line runs through, in alphabetical order. */
export function statesOf(geometry: Geometry): string[] {
  const all = load()
  const found = new Set<string>()
  const test = (lon: number, lat: number) => {
    const name = stateAt(lon, lat, all)
    if (name) found.add(name)
  }
  for (const line of lines(geometry)) {
    for (let i = 0; i < line.length; i++) {
      const [lon, lat] = line[i]
      test(lon, lat)
      const next = line[i + 1]
      if (!next) continue
      const steps = Math.ceil(
        Math.max(Math.abs(next[0] - lon), Math.abs(next[1] - lat)) / STEP
      )
      for (let k = 1; k < steps; k++) {
        test(
          lon + ((next[0] - lon) * k) / steps,
          lat + ((next[1] - lat) * k) / steps
        )
      }
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b))
}

/** Each section's states, by section id. */
export function statesBySection(
  sections: readonly { id: string; geometry: Geometry }[]
): Map<string, readonly string[]> {
  return new Map(sections.map((s) => [s.id, statesOf(s.geometry)]))
}
