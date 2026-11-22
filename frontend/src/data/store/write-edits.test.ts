import { afterEach, describe, expect, it, vi } from "vitest"

import {
  parseQuantity,
  persistableEdits,
  saveEditsToStore,
} from "./write-edits"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

afterEach(() => vi.unstubAllGlobals())

describe("persistableEdits", () => {
  it("keeps only the attributes store has a claim key for", () => {
    const edits = [
      { sectionId: "s-1", attribute: "Diameter", value: "12 in" },
      { sectionId: "s-1", attribute: "First seen", value: "1931" },
    ]
    expect(persistableEdits(edits)).toEqual([edits[0]])
  })
})

describe("parseQuantity", () => {
  it("splits a number from its unit", () => {
    expect(parseQuantity("12 in")).toEqual({ value: 12, unit: "in" })
    expect(parseQuantity("6in")).toEqual({ value: 6, unit: "in" })
  })

  it("allows a bare number, with no unit", () => {
    expect(parseQuantity("12")).toEqual({ value: 12, unit: null })
  })

  it("says null for text with no number in it", () => {
    expect(parseQuantity("Mixed")).toBeNull()
    expect(parseQuantity("")).toBeNull()
  })
})

describe("saveEditsToStore", () => {
  it("writes one claim per section per writable attribute, citing a Studio edit source", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(json({ ids: {}, created: {} })))
    vi.stubGlobal("fetch", fetchMock)
    await saveEditsToStore(
      [
        { sectionId: "s-1", attribute: "Diameter", value: "12 in" },
        { sectionId: "s-2", attribute: "Diameter", value: "12 in" },
      ],
      "Checked against the 1931 sheet"
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body.sources).toEqual([
      {
        ref: "studio-edit-source",
        kind: "dataset",
        title: "Studio edit",
        external_key: { system: "studio", key: "studio-edit-source" },
      },
    ])
    expect(body.citations).toHaveLength(2)
    expect(body.citations[0]).toMatchObject({
      source: "studio-edit-source",
      quote: "Checked against the 1931 sheet",
    })
    expect(body.claims).toEqual([
      expect.objectContaining({
        feature: "s-1",
        attribute: "diameter",
        value_num: 12,
        value_unit: "in",
      }),
      expect.objectContaining({
        feature: "s-2",
        attribute: "diameter",
        value_num: 12,
        value_unit: "in",
      }),
    ])
  })

  it("writes nothing when every edited attribute is local to Studio only", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json({})))
    vi.stubGlobal("fetch", fetchMock)
    await saveEditsToStore(
      [{ sectionId: "s-1", attribute: "First seen", value: "1931" }],
      ""
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never writes Status or Geometry as typed text: store needs its own word or a line", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await saveEditsToStore(
      [
        { sectionId: "s-1", attribute: "Status", value: "Shown by 1932" },
        { sectionId: "s-1", attribute: "Geometry", value: "Traced line" },
      ],
      ""
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuses a diameter that is not a number instead of saving nothing quietly", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      saveEditsToStore(
        [{ sectionId: "s-1", attribute: "Diameter", value: "about 12" }],
        ""
      )
    ).rejects.toThrow(
      'Diameter "about 12" is not a number. Nothing was changed.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("says why store refused, in its own words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          json({ detail: "diameter needs a unit store knows" }, 422)
        )
      )
    )
    await expect(
      saveEditsToStore(
        [{ sectionId: "s-1", attribute: "Diameter", value: "12 parsecs" }],
        ""
      )
    ).rejects.toMatchObject({
      kind: "invalid",
      message: "Store did not accept this change. Nothing was changed.",
      detail: "diameter needs a unit store knows",
    })
  })
})
