import { afterEach, describe, expect, it, vi } from "vitest"

import { testNetwork } from "@/test/network"

import {
  applyChange,
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
