import { afterEach, describe, expect, it, vi } from "vitest"

import {
  lookupIn,
  requestDetails,
  setDetailReader,
  useDetails,
  type DetailAnswer,
  type DetailReader,
  type SectionDetail,
} from "./detail-store"

/*
 * Reading sections' details: together, once, never an older answer over a
 * newer one, and nothing kept from a reader that is no longer the network's.
 * The sample needs none of this: its sections hold their claims.
 */

const detail = (value: string): SectionDetail => ({
  claims: [
    {
      attribute: "Diameter",
      value,
      citations: [{ source: "Invented Gas Journal" }],
      proposals: [],
    },
  ],
  proposedEnds: [],
})

const light = (id: string) => ({ id, proposedEnds: [] })
const shown = (id: string) =>
  lookupIn(useDetails.getState())(light(id))?.claims[0].value ?? null
const entry = (id: string) => useDetails.getState().entries[id]

const settled = () =>
  vi.waitFor(() =>
    expect(
      Object.values(useDetails.getState().entries).some(
        (e) => e.status === "loading"
      )
    ).toBe(false)
  )

const answering =
  (value: string): DetailReader =>
  (ids) =>
    Promise.resolve(new Map(ids.map((id) => [id, detail(value)])))

/** A reader whose reads wait until released, and stop when told to. */
function held() {
  const waiting: { ids: readonly string[]; release: (v: string) => void }[] = []
  const read: DetailReader = (ids, signal) =>
    new Promise<DetailAnswer>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason))
      waiting.push({
        ids,
        release: (value) =>
          resolve(new Map(ids.map((id) => [id, detail(value)]))),
      })
    })
  return { read, waiting }
}

afterEach(() => setDetailReader(null))

describe("section details", () => {
  it("reads ids asked for together in one request, and once", async () => {
    const reader = vi.fn(answering("12 in"))
    setDetailReader(reader)
    requestDetails(["a"])
    requestDetails(["b", "a"])
    await settled()
    expect(reader).toHaveBeenCalledTimes(1)
    expect(reader.mock.calls[0][0]).toEqual(["a", "b"])
    requestDetails(["a", "b"])
    await settled()
    expect(reader).toHaveBeenCalledTimes(1)
    expect(shown("a")).toBe("12 in")
  })

  it("marks an id store left out as failed, not loading, and retries it on asking", async () => {
    const reader = vi.fn<DetailReader>(() =>
      Promise.resolve(new Map([["a", detail("12 in")]]))
    )
    setDetailReader(reader)
    requestDetails(["a", "gone"])
    await settled()
    expect(entry("gone").status).toBe("failed")
    requestDetails(["gone"])
    expect(reader).toHaveBeenCalledTimes(1) // not again unless asked to
    requestDetails(["gone"], { again: true })
    await settled()
    expect(reader).toHaveBeenCalledTimes(2)
  })

  it("says why one section failed, and keeps the others", async () => {
    setDetailReader(() =>
      Promise.resolve(
        new Map<string, SectionDetail | { error: string }>([
          ["a", detail("12 in")],
          [
            "b",
            {
              error:
                "Couldn't load. The answer was not in a form Studio understands.",
            },
          ],
        ])
      )
    )
    requestDetails(["a", "b"])
    await settled()
    expect(shown("a")).toBe("12 in")
    expect(entry("b")).toMatchObject({
      status: "failed",
      error: "Couldn't load. The answer was not in a form Studio understands.",
    })
  })

  it("keeps an old detail shown while the same network is read again", async () => {
    setDetailReader(answering("12 in"), "gas|")
    requestDetails(["a"])
    await settled()
    const again = held()
    setDetailReader(again.read, "gas|")
    expect(shown("a")).toBe("12 in")
    requestDetails(["a"])
    await vi.waitFor(() => expect(again.waiting).toHaveLength(1))
    expect(shown("a")).toBe("12 in") // still shown while read again
    again.waiting[0].release("16 in")
    await settled()
    expect(shown("a")).toBe("16 in")
  })

  it("drops what was kept when another network is shown", async () => {
    setDetailReader(answering("12 in"), "gas|")
    requestDetails(["a"])
    await settled()
    setDetailReader(answering("16 in"), "oil|")
    expect(entry("a")).toBeUndefined()
  })

  it("keeps nothing a replaced reader answers, and stops its reads", async () => {
    const old = held()
    setDetailReader(old.read, "gas|")
    requestDetails(["a"])
    await vi.waitFor(() => expect(old.waiting).toHaveLength(1))
    // The network is read again; the old reader answers after.
    setDetailReader(answering("16 in"), "gas|")
    old.waiting[0].release("12 in")
    requestDetails(["a"])
    await settled()
    expect(shown("a")).toBe("16 in")
  })

  it("is not blocked by reads that never answer, once a new reader is set", async () => {
    const stuck = held()
    setDetailReader(stuck.read, "gas|")
    requestDetails(["a"])
    requestDetails(["b"], { urgent: true })
    await vi.waitFor(() => expect(stuck.waiting.length).toBeGreaterThan(0))
    for (let i = 0; i < 6; i++) requestDetails([`x${i}`])
    setDetailReader(answering("16 in"), "gas|")
    requestDetails(["c"])
    await vi.waitFor(() => expect(shown("c")).toBe("16 in"))
    // What the old reader had under way is asked for again when needed.
    requestDetails(["a"])
    await vi.waitFor(() => expect(shown("a")).toBe("16 in"))
  })

  it("fails a read that takes too long, so it can be tried again", async () => {
    const stuck = held()
    setDetailReader(stuck.read, "gas|", 30)
    requestDetails(["a"])
    await settled()
    expect(entry("a")).toMatchObject({
      status: "failed",
      error: "Store took too long to answer.",
    })
  })

  it("reads a section asked for on its own ahead of a long list", async () => {
    const order: string[][] = []
    setDetailReader((ids) => {
      order.push([...ids])
      return answering("12 in")(ids, new AbortController().signal)
    })
    requestDetails(Array.from({ length: 900 }, (_, i) => `inbox-${i}`))
    requestDetails(["opened"], { urgent: true })
    await settled()
    expect(order[0]).toEqual(["opened"])
  })
})
