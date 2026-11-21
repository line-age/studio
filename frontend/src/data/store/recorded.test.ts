import { describe, expect, it } from "vitest"

import { claimValues, sectionDetailSchema } from "@/data/schema"
import recorded from "@/test/store-recorded.json"

import { fetchFeatures, fetchLinks, fetchSectionRows } from "./client"
import { toDetail, toSummary } from "./to-network"

/*
 * The list and the detail against answers store itself gave: invented data,
 * recorded by store's tests/test_reads.py (test_record_answers_for_studio).
 * Re-record after a change to store's reads:
 *   STUDIO_FIXTURE_OUT=<this repo>/frontend/src/test/store-recorded.json \
 *     uv run pytest tests/test_reads.py -k record
 * Each answer is read through the client's own schemas, as from the wire.
 */

async function parsed() {
  const answer = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      })
    )
  const realFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.startsWith("/store/sections")) return answer(recorded.rows)
    if (path.startsWith("/store/links")) {
      const relation = new URLSearchParams(path.split("?")[1]).get("relation")
      return answer(recorded.links.filter((l) => l.relation === relation))
    }
    const ids = new URLSearchParams(path.split("?")[1]).get("ids")!.split(",")
    return answer(
      [...recorded.features, ...recorded.removals].filter((f) =>
        ids.includes(f.id)
      )
    )
  }) as typeof fetch
  try {
    const rows = await fetchSectionRows("oil")
    const links = (
      await Promise.all(
        ["same_as", "overlaps", "part_of"].map((r) => fetchLinks(r, "oil"))
      )
    ).flat()
    const features = await fetchFeatures(recorded.features.map((f) => f.id))
    const removals = await fetchFeatures(recorded.removals.map((f) => f.id))
    return { rows, links, features, removals }
  } finally {
    globalThis.fetch = realFetch
  }
}

describe("store's own answers", () => {
  it("name who traced each section, from the list alone", async () => {
    const { rows, links } = await parsed()
    const summary = toSummary("Oil network", rows, { links })
    // The recorded person is invented; the id is what a link would carry.
    for (const section of summary.sections) {
      expect(section.tracedBy).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: "Ann Example",
      })
    }
  })

  it("give the same values in the list as in each section's detail", async () => {
    const { rows, links, features, removals } = await parsed()
    const summary = toSummary("Oil network", rows, { links })
    expect(summary.sections).toHaveLength(4)
    for (const section of summary.sections) {
      const feature = features.find((f) => f.id === section.id)!
      const detail = sectionDetailSchema.parse(
        toDetail(feature, section, removals)
      )
      expect(claimValues(detail.claims)).toEqual(section.values)
    }
  })

  it("cover what the check is for: a candidate, an end, a cut, two editions", async () => {
    const { rows, links } = await parsed()
    const summary = toSummary("Oil network", rows, { links })
    const value = (attribute: string) =>
      summary.sections.map((s) =>
        s.values.find((v) => v.attribute === attribute)!
      )
    expect(value("Diameter").some((v) => v.value && v.proposals > 0)).toBe(true)
    expect(value("Last seen").some((v) => v.value !== null)).toBe(true)
    expect(summary.sections.some((s) => s.proposedEnds.length > 0)).toBe(true)
    expect(summary.editions.map((e) => e.year)).toEqual([1937, 1955])
  })
})
