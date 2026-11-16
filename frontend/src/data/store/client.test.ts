import { afterEach, describe, expect, it, vi } from "vitest"

import { loadFromStore } from "@/data/load-network"
import {
  storeFeatures,
  storeLinks,
  storeRemovals,
  storeRows,
} from "@/test/store-payloads"

import { StoreError, fetchFeature, fetchSectionRows, postBundle } from "./client"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function answer(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
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

  /** Store answering with the invented payloads. */
  function answerWithNetwork() {
    const features = [...storeFeatures(), ...storeRemovals()]
    return answer((path) => {
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
  }

  it("loads a network: the rows, each section once, links, lines traced as gone", async () => {
    const fetchMock = answerWithNetwork()
    // The whole network, whatever area this machine's settings name.
    const network = await loadFromStore("gas", null)
    expect(network.name).toBe("Gas network")
    // The lines traced as gone are read, and are not sections.
    expect(network.sections).toHaveLength(3)
    // One list, one request per section (cut pieces not asked for twice),
    // three lists of links, one request per line traced as gone.
    expect(fetchMock).toHaveBeenCalledTimes(1 + 3 + 3 + 3)
    expect(network.sections.flatMap((x) => x.proposedEnds)).toHaveLength(2)
    expect(JSON.stringify(network)).not.toContain("A. Tracer")
  })

  it("asks store for one area when given one, and says so in the name", async () => {
    const fetchMock = answerWithNetwork()
    const network = await loadFromStore("gas", "1,2,3,4")
    expect(network.name).toBe("Gas network, one area")
    const asked = fetchMock.mock.calls
      .map(([path]) => String(path))
      .find((path) => path.startsWith("/store/sections"))!
    expect(new URLSearchParams(asked.split("?")[1]).get("bbox")).toBe("1,2,3,4")
  })
})

describe("postBundle", () => {
  const bundle = {
    sources: [{ ref: "s", kind: "dataset", title: "Studio edit" }],
    citations: [{ ref: "c", source: "s" }],
    claims: [
      {
        feature: "section-1",
        attribute: "diameter",
        value_num: 12,
        value_unit: "in",
        citations: [{ citation: "c", role: "confirms" }],
      },
    ],
  }

  it("posts to this app's own /bundles path, never store itself", async () => {
    const fetchMock = answer(() =>
      json({ ids: { c: "cid-1" }, created: { c: true } })
    )
    await postBundle(bundle)
    expect(fetchMock.mock.calls[0][0]).toBe("/store/bundles")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual(bundle)
  })

  it("returns the ids and created flags store answers with", async () => {
    answer(() => json({ ids: { c: "cid-1" }, created: { c: true } }))
    expect(await postBundle(bundle)).toEqual({
      ids: { c: "cid-1" },
      created: { c: true },
    })
  })

  it("tells a store that cannot be reached from one that refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    )
    expect(await kindOf(() => postBundle(bundle))).toBe("unreachable")
    answer(() => json({}, 503))
    expect(await kindOf(() => postBundle(bundle))).toBe("unreachable")
    answer(() => json({ detail: "send a bearer token" }, 403))
    expect(await kindOf(() => postBundle(bundle))).toBe("refused")
  })

  it("says when an answer is not what it understands", async () => {
    answer(() => new Response("<!doctype html>", { status: 200 }))
    expect(await kindOf(() => postBundle(bundle))).toBe("unreadable")
    answer(() => json({ ids: {} }))
    expect(await kindOf(() => postBundle(bundle))).toBe("unreadable")
  })
})
