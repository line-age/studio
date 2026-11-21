import { z } from "zod"

import type { DetailReader } from "./detail-store"
import {
  FixtureError,
  parseNetwork,
  sectionDetailSchema,
  type Network,
  type SectionDetail,
} from "./schema"
import { fetchFeatures, fetchLinks, fetchSectionRows } from "./store/client"
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

/**
 * The network, and how to read a section's detail: on store's data a reader
 * goes with the network it was made for (`detailReaderOf`). Nothing is set up
 * here: the screen installs the reader of the network it shows, so an older
 * read that answers late can change nothing. `signal` stops a read no longer
 * wanted.
 */
export function loadNetwork(signal?: AbortSignal): Promise<Network> {
  return dataSource() === "store"
    ? loadFromStore(storeNetwork(), storeArea(), signal)
    : loadFixture()
}

const readers = new WeakMap<Network, { read: DetailReader; of: string }>()

/** The reader for this network's details, and which network it reads; none on the sample. */
export function detailReaderOf(
  network: Network
): { read: DetailReader; of: string } | null {
  return readers.get(network) ?? null
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
  area = storeArea(),
  signal?: AbortSignal
): Promise<Network> {
  const stop = new AbortController()
  signal?.addEventListener("abort", () => stop.abort(), { once: true })
  let answers
  try {
    answers = await Promise.all([
      fetchSectionRows(network, area, stop.signal),
      fetchLinks("same_as", network, stop.signal),
      fetchLinks("overlaps", network, stop.signal),
      fetchLinks("part_of", network, stop.signal),
    ])
  } catch (error) {
    stop.abort()
    throw error
  }
  const [rows, sameAs, overlaps, partOf] = answers
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
  const lines =
    lineIds.length > 0 ? await fetchFeatures(lineIds, stop.signal) : []
  const name = network.charAt(0).toLocaleUpperCase() + network.slice(1)
  // The name says so when this is one area and not the whole network.
  const title = area === null ? `${name} network` : `${name} network, one area`
  const summary = toSummary(title, rows, {
    links: [...sameAs, ...overlaps, ...partOf],
    lines,
  })
  readers.set(summary, {
    read: storeDetailReader(summary),
    of: `${network}|${area ?? ""}`,
  })
  return summary
}

/**
 * Reads sections' details from store, with the lines traced as gone their
 * ends point at. Each detail is checked against the schema; one that does not
 * fit fails alone, saying why.
 */
function storeDetailReader(network: Network): DetailReader {
  const byId = new Map(network.sections.map((s) => [s.id, s]))
  return async (ids, signal) => {
    const features = await fetchFeatures(ids, signal)
    const light = features.flatMap((f) => byId.get(f.id) ?? [])
    const removalIds = removalIdsOf(light)
    const removals =
      removalIds.length > 0 ? await fetchFeatures(removalIds, signal) : []
    const answer = new Map<string, SectionDetail | { error: string }>()
    for (const feature of features) {
      const section = byId.get(feature.id)
      if (!section) continue
      try {
        const parsed = sectionDetailSchema.safeParse(
          toDetail(feature, section, removals)
        )
        answer.set(
          feature.id,
          parsed.success
            ? parsed.data
            : {
                error: `Store answered in a form Studio does not understand. ${z.prettifyError(parsed.error)}`,
              }
        )
      } catch (error) {
        answer.set(feature.id, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return answer
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
  return parseNetwork(json)
}
