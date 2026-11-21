import { afterEach, describe, expect, it, vi } from "vitest"

import {
  lookupIn,
  requestDetails,
  setDetailReader,
  useDetails,
} from "@/data/detail-store"
import { detailReaderOf, loadFromStore } from "@/data/load-network"
import {
  storeFeatures,
  storeLinks,
  storeRemovals,
  storeRows,
} from "@/test/store-payloads"

import {
  StoreError,
  fetchFeatures,
  fetchSectionRows,
  postBundle,
} from "./client"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function answer(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >((input) => Promise.resolve(handler(String(input))))
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

afterEach(() => {
  vi.unstubAllGlobals()
  setDetailReader(null)
})

describe("store client", () => {
  it("asks this app's own /store path, never store itself", async () => {
    const fetchMock = answer(() => json({ features: [] }))
    await fetchSectionRows("gas")
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/store/sections?network=gas&limit=10000&include=summary"
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
    answer(() => json({ detail: "ask for 1 to 200" }, 422))
    expect(await kindOf(() => fetchFeatures(["x"]))).toBe("unreadable")
  })

  it("refuses to show part of a list as the whole", async () => {
    const full = Array.from({ length: 10000 }, (_, i) => ({
      properties: { row_id: `s-${i}`, section_id: `s-${i}` },
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
          features: storeRows().map(({ geometry, ...properties }) => ({
            geometry,
            properties,
          })),
        })
      }
      if (path.startsWith("/store/links")) {
        const query = new URLSearchParams(path.split("?")[1])
        expect(query.get("network")).toBe("gas")
        const relation = query.get("relation")
        return json(
          storeLinks()
            .filter((l) => l.relation === relation)
            .map((l) => ({
              ...l,
              asserted_by_name: "A. Tracer",
              asserted_by_kind: "person",
            }))
        )
      }
      const ids = new URLSearchParams(path.split("?")[1]).get("ids")!.split(",")
      return json(
        ids.flatMap((id) => {
          const found = features.find((f) => f.id === id)
          return found
            ? [
                {
                  ...found,
                  claims: found.claims.map((c) => ({
                    ...c,
                    asserted_by_name: "A. Tracer",
                  })),
                },
              ]
            : []
        })
      )
    })
  }

  it("opens a network in a handful of requests, none per section", async () => {
    const fetchMock = answerWithNetwork()
    // The whole network, whatever area this machine's settings name.
    const network = await loadFromStore("gas", null)
    expect(network.name).toBe("Gas network")
    // Each section once, cut pieces and lines traced as gone not among them.
    expect(network.sections).toHaveLength(3)
    // One list of sections and three of links. No line: nothing to ask.
    expect(fetchMock.mock.calls.map(([p]) => String(p).split("?")[0])).toEqual([
      "/store/sections",
      "/store/links",
      "/store/links",
      "/store/links",
    ])
    expect(network.sections.flatMap((x) => x.proposedEnds)).toHaveLength(2)
    // Values are there; claims and citations are not, until a section is opened.
    expect(network.sections.every((s) => s.claims === undefined)).toBe(true)
    // A person who proposed a link is never named.
    expect(JSON.stringify(network)).not.toContain("A. Tracer")
  })

  it("reads opened sections' detail together, with the lines traced as gone", async () => {
    const fetchMock = answerWithNetwork()
    const network = await loadFromStore("gas", null)
    fetchMock.mockClear()
    // The screen installs the reader of the network it shows; loading does not.
    expect(useDetails.getState().entries).toEqual({})
    const reader = detailReaderOf(network)!
    expect(reader.of).toBe("gas|")
    setDetailReader(reader.read, reader.of)
    requestDetails(network.sections.map((s) => s.id))
    await vi.waitFor(() =>
      expect(
        Object.values(useDetails.getState().entries).every(
          (e) => e.status === "ready"
        )
      ).toBe(true)
    )
    // One request for the three sections, one for the lines traced as gone.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [a] = network.sections
    expect(
      lookupIn(useDetails.getState())(a)?.claims.map((c) => c.attribute)
    ).toContain("Geometry")
    expect(JSON.stringify(useDetails.getState())).not.toContain("A. Tracer")
  })

  it("stops the rest and fails whole when one request fails", async () => {
    let stopped = 0
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        if (path.includes("relation=overlaps")) {
          return Promise.resolve(json({}, 502))
        }
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => {
            stopped += 1
            reject(new DOMException("stopped", "AbortError"))
          })
        )
      })
    )
    expect(await kindOf(() => loadFromStore("gas", null))).toBe("unreachable")
    expect(stopped).toBe(3)
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
