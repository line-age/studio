import type { FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { feature } from "topojson-client"
import states from "us-atlas/states-10m.json"

import type { Geometry } from "./schema"

/*
 * Which US states a section runs through, for the State filter. The outlines
 * are the Census Bureau's 1:10m cartographic boundaries as us-atlas ships
 * them, in longitude and latitude. A line is placed by its points; where two
 * points in a row are in different states, or off the map, by points between
 * them at most STEP degrees apart too. A stretch whose two ends are in one
 * state is taken to stay in it, so a short pass through a corner of another
 * can be missed; at these maps' accuracy that is noise. This is where
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

function contains(state: State, lon: number, lat: number): boolean {
  const [w, s, e, n] = state.bounds
  if (lon < w || lon > e || lat < s || lat > n) return false
  return state.polygons.some(
    ([outer, ...holes]) =>
      inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))
  )
}

/** The state at a point. `hint` is tried first: the last point's state. */
function stateAt(
  lon: number,
  lat: number,
  all: State[],
  hint: State | null
): State | null {
  if (hint && contains(hint, lon, lat)) return hint
  for (const state of all) {
    if (state !== hint && contains(state, lon, lat)) return state
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
  // Points along a line are nearly always in the state of the point before.
  let last: State | null = null
  const at = (lon: number, lat: number) => {
    const state = stateAt(lon, lat, all, last)
    if (state) {
      found.add(state.name)
      last = state
    }
    return state
  }
  for (const line of lines(geometry)) {
    let here = line.length > 0 ? at(line[0][0], line[0][1]) : null
    for (let i = 0; i + 1 < line.length; i++) {
      const [lon, lat] = line[i]
      const next = line[i + 1]
      const there = at(next[0], next[1])
      // Both ends in one state: the stretch between is taken to be too.
      // Otherwise walk it, to find a state it only passes through.
      if (here === null || there === null || here !== there) {
        const steps = Math.ceil(
          Math.max(Math.abs(next[0] - lon), Math.abs(next[1] - lat)) / STEP
        )
        for (let k = 1; k < steps; k++) {
          at(
            lon + ((next[0] - lon) * k) / steps,
            lat + ((next[1] - lat) * k) / steps
          )
        }
      }
      here = there
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b))
}

/** Looks up the states of a section by id. */
export interface StatesLookup {
  get(sectionId: string): readonly string[] | undefined
}

/**
 * Each section's states, by section id, worked out the first time a section
 * is asked about and kept: nothing is spent until the State filter or its
 * counts need it.
 */
export function statesBySection(
  sections: readonly { id: string; geometry: Geometry }[]
): StatesLookup {
  const byId = new Map(sections.map((s) => [s.id, s.geometry]))
  const known = new Map<string, readonly string[]>()
  return {
    get(sectionId) {
      const had = known.get(sectionId)
      if (had) return had
      const geometry = byId.get(sectionId)
      if (!geometry) return undefined
      const found = statesOf(geometry)
      known.set(sectionId, found)
      return found
    },
  }
}
