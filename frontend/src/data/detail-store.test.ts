import { afterEach, describe, expect, it, vi } from "vitest"

import {
  detailOf,
  requestDetails,
  setDetailReader,
  useDetails,
  type SectionDetail,
} from "./detail-store"

/*
 * Reading sections' details: together, once, and never an older answer over
 * a newer one. The sample needs none of this: its sections hold their claims.
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

const settled = () =>
  vi.waitFor(() =>
    expect(
      Object.values(useDetails.getState().entries).some(
        (e) => e.status === "loading"
      )
    ).toBe(false)
  )

afterEach(() => setDetailReader(null))

describe("section details", () => {
  it("reads ids asked for together in one request, and once", async () => {
    const reader = vi.fn((ids: readonly string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, detail("12 in")])))
    )
    setDetailReader(reader)
    requestDetails(["a"])
    requestDetails(["b", "a"])
    await settled()
    expect(reader).toHaveBeenCalledTimes(1)
    expect(reader.mock.calls[0][0]).toEqual(["a", "b"])
    requestDetails(["a", "b"])
    await settled()
    expect(reader).toHaveBeenCalledTimes(1)
    expect(detailOf(light("a"))?.claims[0].value).toBe("12 in")
  })

  it("marks an id store left out as failed, not loading, and retries it on asking", async () => {
    const reader = vi.fn(() =>
      Promise.resolve(new Map([["a", detail("12 in")]]))
    )
    setDetailReader(reader)
    requestDetails(["a", "gone"])
    await settled()
    expect(useDetails.getState().entries.gone.status).toBe("failed")
    requestDetails(["gone"])
    expect(reader).toHaveBeenCalledTimes(1) // not again unless asked to
    requestDetails(["gone"], true)
    await settled()
    expect(reader).toHaveBeenCalledTimes(2)
  })

  it("keeps an old detail shown while it is read again after a new read of the network", async () => {
    let answer = "12 in"
    const slow: ((v: Map<string, SectionDetail>) => void)[] = []
    setDetailReader(
      (ids) =>
        new Promise((resolve) => {
          const value = answer
          slow.push(() =>
            resolve(new Map(ids.map((id) => [id, detail(value)])))
          )
        })
    )
    requestDetails(["a"])
    await vi.waitFor(() => expect(slow).toHaveLength(1))
    slow[0](new Map())
    await settled()
    expect(detailOf(light("a"))?.claims[0].value).toBe("12 in")

    // The network is read again (as after a write): the old detail stays.
    answer = "16 in"
    const first = slow.length
    setDetailReader(
      (ids) =>
        new Promise((resolve) => {
          const value = answer
          slow.push(() =>
            resolve(new Map(ids.map((id) => [id, detail(value)])))
          )
        })
    )
    expect(detailOf(light("a"))?.claims[0].value).toBe("12 in")
    requestDetails(["a"])
    await vi.waitFor(() => expect(slow.length).toBe(first + 1))
    slow[first](new Map())
    await settled()
    expect(detailOf(light("a"))?.claims[0].value).toBe("16 in")
  })
})
