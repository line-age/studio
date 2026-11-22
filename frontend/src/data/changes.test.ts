import { afterEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import {
  applyChange,
  inverseOf,
  newPipelineId,
  pipelineDecision,
  sendChange,
} from "./changes"
import { parseNetwork, type Network } from "./schema"

/* Changes on the invented test network: in memory, and as sent to store. */

const sectionOf = (network: Network, id: string) =>
  network.sections.find((s) => s.id === id)!

/** The test network with s-1 also proposed into p-3, as if a tool grouped it. */
function withPlacedProposal(): Network {
  const network = testNetwork()
  return parseNetwork({
    ...network,
    sections: network.sections.map((s) =>
      s.id === "s-1"
        ? {
            ...s,
            membershipId: "link-s1",
            proposedMemberships: [
              { id: "pm-2", pipelineId: "p-3", score: 0.6, proposer: "stitch" },
            ],
          }
        : s
    ),
  })
}

describe("applyChange on the sample", () => {
  it("makes a new pipeline, with no name, from the sections", () => {
    const after = applyChange(
      testNetwork(),
      { kind: "place", sectionIds: ["s-1", "s-4"], target: { kind: "new" } },
      "k"
    )
    const made = after.pipelines.find((p) => p.id === newPipelineId("k"))
    expect(made?.name).toBeNull()
    expect(sectionOf(after, "s-1").pipelineId).toBe(made?.id)
    expect(sectionOf(after, "s-4").pipelineId).toBe(made?.id)
  })

  it("makes a new pipeline with the name a person gave it, cited to their edit", () => {
    const after = applyChange(
      testNetwork(),
      {
        kind: "place",
        sectionIds: ["s-1"],
        target: { kind: "new", name: " Calder Valley " },
      },
      "k"
    )
    const made = after.pipelines.find((p) => p.id === newPipelineId("k"))!
    expect(made.name).toBe("Calder Valley")
    expect(made.claims).toMatchObject([
      {
        attribute: "Name",
        value: "Calder Valley",
        citations: [{ source: "Studio edit" }],
      },
    ])
  })

  it("adds and removes a pipeline's sections in one change", () => {
    const network = testNetwork()
    const pipelineId = sectionOf(network, "s-1").pipelineId!
    const outside = network.sections.find((s) => s.pipelineId !== pipelineId)!
    const after = applyChange(
      network,
      { kind: "members", pipelineId, add: [outside.id], remove: ["s-1"] },
      "k"
    )
    expect(sectionOf(after, outside.id).pipelineId).toBe(pipelineId)
    expect(sectionOf(after, "s-1").pipelineId).toBeNull()
  })

  it("sets a pipeline's own claims, the name too, with the note as the quote", () => {
    const network = testNetwork()
    const pipeline = network.pipelines[0]
    const after = applyChange(
      network,
      {
        kind: "edit-pipeline",
        pipelineId: pipeline.id,
        edits: [
          { attribute: "Name", value: "Calder Valley" },
          { attribute: "Operator", value: "Birch Transmission" },
        ],
        note: "renamed in 1950",
      },
      "k"
    )
    const edited = after.pipelines.find((p) => p.id === pipeline.id)!
    expect(edited.name).toBe("Calder Valley")
    expect(edited.claims.find((c) => c.attribute === "Operator")).toMatchObject(
      {
        value: "Birch Transmission",
        citations: [{ source: "Studio edit", quote: "renamed in 1950" }],
      }
    )
  })

  it("takes a section out", () => {
    const after = applyChange(
      testNetwork(),
      { kind: "place", sectionIds: ["s-1"], target: { kind: "none" } },
      "k"
    )
    expect(sectionOf(after, "s-1").pipelineId).toBeNull()
  })

  it("confirms a proposed pipeline whole, leaving a placed section where it is", () => {
    const network = withPlacedProposal()
    const decision = pipelineDecision(network, "p-3")!
    expect(decision.confirms.map((c) => c.section.id)).toEqual(["s-4"])
    expect(decision.placed.map((s) => s.id)).toEqual(["s-1"])
    const after = applyChange(
      network,
      { kind: "decide-pipeline", pipelineId: "p-3", verdict: "confirm" },
      "k"
    )
    expect(sectionOf(after, "s-4").pipelineId).toBe("p-3")
    expect(sectionOf(after, "s-1").pipelineId).toBe("p-1")
    expect(sectionOf(after, "s-1").proposedMemberships).toHaveLength(1)
  })

  it("rejects a proposed pipeline whole", () => {
    const after = applyChange(
      withPlacedProposal(),
      { kind: "decide-pipeline", pipelineId: "p-3", verdict: "reject" },
      "k"
    )
    expect(after.sections.flatMap((s) => s.proposedMemberships)).toEqual([])
  })

  it("accepts a candidate claim: its value is cited now", () => {
    const at = {
      owner: "section" as const,
      ownerId: "s-2",
      attribute: "Diameter",
      index: 0,
    }
    const after = applyChange(
      testNetwork(),
      { kind: "decide-claim", at, verdict: "confirm" },
      "k"
    )
    const claim = sectionOf(after, "s-2").claims!.find(
      (c) => c.attribute === "Diameter"
    )!
    expect(claim.value).not.toBeNull()
    expect(claim.citations.length).toBeGreaterThan(0)
    expect(claim.proposals).toEqual([])
  })
})

describe("sendChange to store", () => {
  afterEach(() => vi.unstubAllGlobals())

  const capture = () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetch)
    return () =>
      (fetch.mock.calls as [string, RequestInit][]).map(([url, init]) => [
        url,
        JSON.parse(String(init.body)),
      ])
  }

  it("confirms only the memberships of sections in no pipeline", async () => {
    const calls = capture()
    await sendChange(
      withPlacedProposal(),
      { kind: "decide-pipeline", pipelineId: "p-3", verdict: "confirm" },
      "k"
    )
    expect(calls()).toEqual([
      ["/store/bundles", { reviews: [{ link: "pm-1", verdict: "confirm" }] }],
    ])
  })

  it("moves a section with its membership's id", async () => {
    const calls = capture()
    await sendChange(
      withPlacedProposal(),
      {
        kind: "place",
        sectionIds: ["s-1"],
        target: { kind: "pipeline", pipelineId: "p-2" },
      },
      "k"
    )
    const [[, body]] = calls()
    expect(body.reviews).toEqual([{ link: "link-s1", verdict: "reject" }])
    expect(body.links[0]).toMatchObject({ from: "s-1", to: "p-2" })
  })

  it("makes a named pipeline in one bundle: the line, its links and its name", async () => {
    const calls = capture()
    await sendChange(
      testNetwork(),
      {
        kind: "place",
        sectionIds: ["s-4"],
        target: { kind: "new", name: "Calder Valley" },
      },
      "k"
    )
    const [[, body]] = calls()
    expect(body.features).toHaveLength(1)
    expect(body.links[0]).toMatchObject({ from: "s-4", to: "line" })
    expect(body.claims).toEqual([
      expect.objectContaining({
        feature: "line",
        attribute: "name",
        value_text: "Calder Valley",
      }),
    ])
    expect(body.sources[0]).toMatchObject({ title: "Studio edit" })
  })

  it("saves a pipeline's added and removed sections in one bundle", async () => {
    const calls = capture()
    const network = withPlacedProposal()
    const outside = network.sections.find(
      (s) => s.pipelineId === null && s.id !== "s-1"
    )!
    await sendChange(
      network,
      {
        kind: "members",
        pipelineId: sectionOf(network, "s-1").pipelineId!,
        add: [outside.id],
        remove: ["s-1"],
      },
      "k"
    )
    const all = calls()
    expect(all).toHaveLength(1)
    const [[url, body]] = all
    expect(url).toBe("/store/bundles")
    expect(body.reviews).toEqual([{ link: "link-s1", verdict: "reject" }])
    expect(body.links).toEqual([
      expect.objectContaining({ from: outside.id, status: "confirmed" }),
    ])
  })

  it("writes a pipeline's own claims on its line, refusing a value the rules do not allow", async () => {
    const calls = capture()
    const change = (value: string) =>
      sendChange(
        testNetwork(),
        {
          kind: "edit-pipeline",
          pipelineId: "p-1",
          edits: [{ attribute: "Owner", value }],
          note: "",
        },
        "k"
      )
    await change("Alder Gas Co.")
    expect(calls()[0][1].claims).toEqual([
      expect.objectContaining({
        feature: "p-1",
        attribute: "owner",
        value_text: "Alder Gas Co.",
      }),
    ])
    await expect(change("   ")).rejects.toThrow(/Give a value/)
    expect(calls()).toHaveLength(1)
  })

  it("refuses to move a section whose membership has no id", async () => {
    capture()
    await expect(
      sendChange(
        testNetwork(),
        { kind: "place", sectionIds: ["s-1"], target: { kind: "none" } },
        "k"
      )
    ).rejects.toThrow(/no id in store/)
  })
})

describe("inverseOf: what Undo sends to store", () => {
  it("puts moved sections back where each was, one change per place", () => {
    const before = testNetwork()
    expect(
      inverseOf(
        before,
        {
          kind: "place",
          sectionIds: ["s-1", "s-3", "s-4"],
          target: { kind: "pipeline", pipelineId: "p-3" },
        },
        { claimIds: [] }
      )
    ).toEqual([
      {
        kind: "place",
        sectionIds: ["s-1"],
        target: { kind: "pipeline", pipelineId: "p-1" },
      },
      {
        kind: "place",
        sectionIds: ["s-3"],
        target: { kind: "pipeline", pipelineId: "p-2" },
      },
      { kind: "place", sectionIds: ["s-4"], target: { kind: "none" } },
    ])
  })

  it("takes back a named new pipeline's sections and rejects its name", () => {
    const undo = inverseOf(
      testNetwork(),
      {
        kind: "place",
        sectionIds: ["s-4"],
        target: { kind: "new", name: "X" },
      },
      { claimIds: ["c-9"] }
    )
    expect(undo).toEqual([
      { kind: "place", sectionIds: ["s-4"], target: { kind: "none" } },
      { kind: "reject-claims", claimIds: ["c-9"] },
    ])
  })

  it("undoes a pipeline's sections: the removed come back, the added go home", () => {
    const undo = inverseOf(
      testNetwork(),
      { kind: "members", pipelineId: "p-1", add: ["s-3"], remove: ["s-1"] },
      { claimIds: [] }
    )
    expect(undo).toEqual([
      {
        kind: "place",
        sectionIds: ["s-3"],
        target: { kind: "pipeline", pipelineId: "p-2" },
      },
      {
        kind: "place",
        sectionIds: ["s-1"],
        target: { kind: "pipeline", pipelineId: "p-1" },
      },
    ])
  })

  it("rejects the claims an Edit pipeline wrote, and undoes no decision", () => {
    const network = testNetwork()
    expect(
      inverseOf(
        network,
        { kind: "edit-pipeline", pipelineId: "p-1", edits: [], note: "" },
        { claimIds: ["c-1", "c-2"] }
      )
    ).toEqual([{ kind: "reject-claims", claimIds: ["c-1", "c-2"] }])
    expect(
      inverseOf(
        network,
        { kind: "decide-pipeline", pipelineId: "p-3", verdict: "confirm" },
        { claimIds: [] }
      )
    ).toEqual([])
  })
})
