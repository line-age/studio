import { FixtureError, parseNetwork, type Network } from "./schema"
import { fetchFeatures, fetchLinks, fetchSectionRows } from "./store/client"
import { toNetwork } from "./store/to-network"

/*
 * The one place the app gets its data. By default it reads a fixture file.
 * With VITE_DATA_SOURCE=store it reads the Lineage store through this app's
 * own /store path (see src/data/store/client.ts). Nothing else fetches data,
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

export function loadNetwork(): Promise<Network> {
  return dataSource() === "store" ? loadFromStore() : loadFixture()
}

export async function loadFromStore(
  network = storeNetwork()
): Promise<Network> {
  const rows = await fetchSectionRows(network)
  const ids = [...new Set(rows.map((row) => row.section_id))]
  const [features, sameAs, overlaps] = await Promise.all([
    fetchFeatures(ids),
    fetchLinks("same_as"),
    fetchLinks("overlaps"),
  ])
  // A line traced as gone is at the other end of such a link from a section.
  // Links between two sections, or of another network, are left alone.
  const sections = new Set(ids)
  const links = [...sameAs, ...overlaps].filter(
    (link) =>
      sections.has(link.from_feature_id) !== sections.has(link.to_feature_id)
  )
  const removalIds = [
    ...new Set(
      links.map((link) =>
        sections.has(link.from_feature_id)
          ? link.to_feature_id
          : link.from_feature_id
      )
    ),
  ]
  const removals = await fetchFeatures(removalIds)
  const name = network.charAt(0).toLocaleUpperCase() + network.slice(1)
  return toNetwork(`${name} network`, rows, features, links, removals)
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
