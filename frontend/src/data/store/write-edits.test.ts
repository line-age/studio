import { afterEach, describe, expect, it, vi } from "vitest"

import { parseQuantity, persistableEdits, saveEditsToStore } from "./write-edits"

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
    const fetchMock = vi.fn(() =>
      Promise.resolve(json({ ids: {}, created: {} }))
    )
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

  it("writes a text claim, with no value_num, for a non-quantity attribute", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json({ ids: {}, created: {} }))
    )
    vi.stubGlobal("fetch", fetchMock)
    await saveEditsToStore(
      [{ sectionId: "s-1", attribute: "Status", value: "Done" }],
      ""
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body.claims).toEqual([
      expect.objectContaining({
        feature: "s-1",
        attribute: "status",
        value_text: "Done",
      }),
    ])
  })
})
