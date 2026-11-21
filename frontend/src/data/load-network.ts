import { setDetailReader, type DetailReader } from "./detail-store"
import { FixtureError, parseNetwork, type Network } from "./schema"
import {
  fetchFeatures,
  fetchLinks,
  fetchSectionRows,
  type StoreLink,
} from "./store/client"
import { removalIdsOf, toDetail, toSummary } from "./store/to-network"

/*
 * The one place the app gets its data. By default it reads a fixture file.
 * With VITE_DATA_SOURCE=store it reads the Lineage store through this app's
 * own /store path (see src/data/store/client.ts), whole or, with
 * VITE_STORE_BBOX, one area of it. Nothing else fetches data,
 * and one source never stands in for the other when it fails.
 */

const DEFAULT_URL = "/fixtures/sample.json"

export type DataSource = "fixture" | "store"

export function dataSource(): DataSource {
  return import.meta.env.VITE_DATA_SOURCE === "store" ? "store" : "fixture"
}

export function fixtureUrl(): string {
  const fromEnv: unknown = import.meta.env.VITE_FIXTURE_URL
  return typeof fromEnv === "string" && fromEnv.length > 0
    ? fromEnv
    : DEFAULT_URL
}

/** Which of store's networks to show: "gas" unless the environment says. */
export function storeNetwork(): string {
  const fromEnv: unknown = import.meta.env.VITE_STORE_NETWORK
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : "gas"
}

/**
 * One area of the network in place of all of it: "minx,miny,maxx,maxy" in
 * WGS 84, from VITE_STORE_BBOX. For a demo, or a network too large to open
 * whole. Every section that crosses the area is loaded, so what is shown is
 * a real part of the network and not an arbitrary cut of the list.
 */
export function storeArea(): string | null {
  const fromEnv: unknown = import.meta.env.VITE_STORE_BBOX
  if (typeof fromEnv !== "string") return null
  const parts = fromEnv.split(",").map(Number)
  return parts.length === 4 && parts.every(Number.isFinite)
    ? parts.join(",")
    : null
}

export function loadNetwork(): Promise<Network> {
  return dataSource() === "store" ? loadFromStore() : loadFixture()
}

/**
 * Store's network as the list needs it, in a handful of requests and none per
 * section: the sections' rows, the links of the network and its lines. A
 * section's claims and citations are read when it is opened
 * (src/data/detail-store.ts). All or nothing: when one request fails the
 * others are stopped and the error says which.
 */
export async function loadFromStore(
  network = storeNetwork(),
  area = storeArea()
): Promise<Network> {
  const stop = new AbortController()
  const all = <T>(work: Promise<T>[]) =>
    Promise.all(
      work.map((p) =>
        p.catch((error: unknown) => {
          stop.abort()
          throw error
        })
      )
    )
  const [rows, sameAs, overlaps, partOf] = await all<unknown>([
    fetchSectionRows(network, area, stop.signal),
    fetchLinks("same_as", network, stop.signal),
    fetchLinks("overlaps", network, stop.signal),
    fetchLinks("part_of", network, stop.signal),
  ]).then(
    (answers) =>
      answers as [
        Awaited<ReturnType<typeof fetchSectionRows>>,
        StoreLink[],
        StoreLink[],
        StoreLink[],
      ]
  )
  // A line is named on a section's row once the section is confirmed part of
  // it, or is at the other end of a part_of link from a section.
  const sections = new Set(rows.map((row) => row.section_id))
  const lineIds = [
    ...new Set([
      ...rows.flatMap((row) => row.line_id ?? []),
      ...partOf.flatMap((link) =>
        sections.has(link.from_feature_id) === sections.has(link.to_feature_id)
          ? []
          : sections.has(link.from_feature_id)
            ? link.to_feature_id
            : link.from_feature_id
      ),
    ]),
  ]
  const lines = lineIds.length > 0 ? await fetchFeatures(lineIds) : []
  const name = network.charAt(0).toLocaleUpperCase() + network.slice(1)
  // The name says so when this is one area and not the whole network.
  const title = area === null ? `${name} network` : `${name} network, one area`
  const summary = toSummary(title, rows, {
    links: [...sameAs, ...overlaps, ...partOf],
    lines,
  })
  setDetailReader(storeDetailReader(summary))
  return summary
}

/** Reads sections' details from store, with the lines traced as gone their ends point at. */
export function storeDetailReader(network: Network): DetailReader {
  const byId = new Map(network.sections.map((s) => [s.id, s]))
  return async (ids) => {
    const features = await fetchFeatures(ids)
    const light = features.flatMap((f) => byId.get(f.id) ?? [])
    const removalIds = removalIdsOf(light)
    const removals =
      removalIds.length > 0 ? await fetchFeatures(removalIds) : []
    return new Map(
      features.flatMap((feature) => {
        const section = byId.get(feature.id)
        return section
          ? [[feature.id, toDetail(feature, section, removals)]]
          : []
      })
    )
  }
}

export async function loadFixture(url = fixtureUrl()): Promise<Network> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new FixtureError(`Could not reach ${url}.`)
  }
  if (!response.ok) {
    throw new FixtureError(
      `Could not load ${url}.`,
      `The server answered ${response.status}.`
    )
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new FixtureError(`${url} is not valid JSON.`)
  }
  setDetailReader(null)
  return parseNetwork(json)
}
