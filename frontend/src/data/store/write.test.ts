import { afterEach, describe, expect, it, vi } from "vitest"

import {
  WriteError,
  decideMembershipsBundle,
  placeBundle,
  post,
  writeErrorKind,
} from "./write"

/* Store's write shapes, with invented ids. */

const inA = { id: "s-1", pipelineId: "line-a", membershipId: "link-1" }
const free = { id: "s-2", pipelineId: null }

describe("placeBundle", () => {
  it("makes a pipeline: a new line and a confirmed membership per section", () => {
    const bundle = placeBundle([free], { kind: "new" }, "k1")
    expect(bundle.features).toEqual([
      {
        ref: "line",
        kind: "line",
        network: "gas",
        external_key: { system: "studio", key: "k1:line" },
      },
    ])
    expect(bundle.links).toEqual([
      {
        ref: "member-0",
        from: "s-2",
        to: "line",
        relation: "part_of",
        status: "confirmed",
        external_key: { system: "studio", key: "k1:s-2" },
      },
    ])
    expect(bundle.reviews).toBeUndefined()
  })

  it("moves: rejects the membership it leaves, then confirms the new one", () => {
    const bundle = placeBundle(
      [inA, free],
      { kind: "pipeline", pipelineId: "line-b" },
      "k2"
    )
    expect(bundle.reviews).toEqual([{ link: "link-1", verdict: "reject" }])
    expect(bundle.links?.map((l) => [l.from, l.to])).toEqual([
      ["s-1", "line-b"],
      ["s-2", "line-b"],
    ])
    expect(bundle.features).toBeUndefined()
  })

  it("takes out: the reject alone", () => {
    expect(placeBundle([inA], { kind: "none" }, "k3")).toEqual({
      reviews: [{ link: "link-1", verdict: "reject" }],
    })
  })

  it("leaves a section already in the target alone", () => {
    const bundle = placeBundle(
      [inA, free],
      { kind: "pipeline", pipelineId: "line-a" },
      "k4"
    )
    expect(bundle.reviews).toBeUndefined()
    expect(bundle.links?.map((l) => l.from)).toEqual(["s-2"])
  })

  it("is the same bundle for the same key, so a retry makes nothing new", () => {
    expect(placeBundle([free], { kind: "new" }, "k5")).toEqual(
      placeBundle([free], { kind: "new" }, "k5")
    )
  })
})

describe("deciding", () => {
  it("decides proposed memberships in one bundle", () => {
    expect(decideMembershipsBundle(["l1", "l2"], "confirm")).toEqual({
      reviews: [
        { link: "l1", verdict: "confirm" },
        { link: "l2", verdict: "confirm" },
      ],
    })
  })

  it("says why store refused, in words", () => {
    expect(writeErrorKind(403, "")).toBe("refused")
    expect(writeErrorKind(409, "that section is already in a pipeline")).toBe(
      "placed"
    )
    expect(writeErrorKind(409, "that link is already rejected")).toBe("decided")
    expect(writeErrorKind(502, "")).toBe("unreachable")
    expect(writeErrorKind(422, "bad")).toBe("invalid")
  })
})

describe("post", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends no token, and turns a refusal into a WriteError", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "that link is already confirmed" }),
        {
          status: 409,
        }
      )
    )
    vi.stubGlobal("fetch", fetch)
    const sent = post("/bundles", { reviews: [] })
    await expect(sent).rejects.toBeInstanceOf(WriteError)
    await expect(sent).rejects.toMatchObject({ kind: "decided" })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/store/bundles")
    expect(init.method).toBe("POST")
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i)
  })
})
