import { afterEach, describe, expect, it, vi } from "vitest"

import { loadFromStore } from "@/data/load-network"
import {
  storeFeatures,
  storeLinks,
  storeRemovals,
  storeRows,
} from "@/test/store-payloads"

import { StoreError, fetchFeature, fetchSectionRows } from "./client"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function answer(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input)))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const kindOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    return error instanceof StoreError ? error.kind : error
  }
  return "no error"
}

afterEach(() => vi.unstubAllGlobals())

describe("store client", () => {
  it("asks this app's own /store path, never store itself", async () => {
    const fetchMock = answer(() => json({ features: [] }))
    await fetchSectionRows("gas")
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/store/sections?network=gas&limit=10000"
    )
  })

  it("tells a store that cannot be reached from one that refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    )
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("unreachable")
    answer(() => json({}, 502))
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("unreachable")
    answer(() => json({ detail: "send a bearer token" }, 401))
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("refused")
  })

  it("says when an answer is not what it understands", async () => {
    answer(() => new Response("<!doctype html>", { status: 200 }))
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("unreadable")
    answer(() => json({ features: [{ properties: {} }] }))
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("unreadable")
    answer(() => json({ detail: "no such feature" }, 404))
    expect(await kindOf(() => fetchFeature("x"))).toBe("unreadable")
  })

  it("refuses to show part of a list as the whole", async () => {
    const full = Array.from({ length: 10000 }, (_, i) => ({
      properties: { section_id: `s-${i}` },
    }))
    answer(() => json({ features: full }))
    expect(await kindOf(() => fetchSectionRows("gas"))).toBe("unreadable")
  })

  it("loads a network: the rows, each section once, links, lines traced as gone", async () => {
    const features = [...storeFeatures(), ...storeRemovals()]
    const fetchMock = answer((path) => {
      if (path.startsWith("/store/sections")) {
        return json({
          features: storeRows().map((properties) => ({ properties })),
        })
      }
      if (path.startsWith("/store/links")) {
        const relation = new URLSearchParams(path.split("?")[1]).get("relation")
        return json(storeLinks().filter((l) => l.relation === relation))
      }
      const id = decodeURIComponent(path.split("/").pop()!)
      return json({
        ...features.find((f) => f.id === id),
        claims: features
          .find((f) => f.id === id)!
          .claims.map((c) => ({ ...c, asserted_by_name: "A. Tracer" })),
      })
    })
    const network = await loadFromStore("gas")
    expect(network.name).toBe("Gas network")
    // The lines traced as gone are read, and are not sections.
    expect(network.sections).toHaveLength(3)
    // One list, one request per section (cut pieces not asked for twice),
    // three lists of links, one request per line traced as gone.
    expect(fetchMock).toHaveBeenCalledTimes(1 + 3 + 3 + 3)
    expect(network.sections.flatMap((x) => x.proposedEnds)).toHaveLength(2)
    expect(JSON.stringify(network)).not.toContain("A. Tracer")
  })
})
