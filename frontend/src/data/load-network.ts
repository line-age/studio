import { FixtureError, parseNetwork, type Network } from "./schema"

/*
 * The one place the app gets its data. Today it reads a fixture file. When an
 * API exists, this function is what changes; nothing else reads fixtures.
 */

const DEFAULT_URL = "/fixtures/sample.json"

export function fixtureUrl(): string {
  const fromEnv: unknown = import.meta.env.VITE_FIXTURE_URL
  return typeof fromEnv === "string" && fromEnv.length > 0
    ? fromEnv
    : DEFAULT_URL
}

export async function loadNetwork(url = fixtureUrl()): Promise<Network> {
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
