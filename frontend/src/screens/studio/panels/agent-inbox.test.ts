import { afterEach, describe, expect, it } from "vitest"

import { lookupIn, setDetailReader, useDetails } from "@/data/detail-store"
import { evidenceNetwork } from "@/test/network"

import { inboxCount, inboxItems } from "./agent-inbox"

/*
 * On store's data the inbox's cards come from sections' details, which can be
 * older than the network: after a decision the network is read again first.
 * A card shows only what the network still has waiting.
 */

afterEach(() => setDetailReader(null))

describe("the inbox after a decision", () => {
  it("shows no card from a detail read before the last write", () => {
    const network = evidenceNetwork()
    const s6 = network.sections.find((s) => s.id === "s-6")!
    // As store's list has it before the decision: no claims, the end waiting.
    const listed = { ...s6, claims: undefined }
    setDetailReader(() => Promise.resolve(new Map()))
    useDetails.setState({
      entries: {
        "s-6": {
          status: "ready",
          generation: useDetails.getState().generation,
          detail: { claims: s6.claims!, proposedEnds: s6.proposedEnds },
        },
      },
    })
    const current = () => lookupIn(useDetails.getState(), true)
    const before = { ...network, sections: [listed] }
    expect(
      inboxItems(before, current()).filter((i) => i.kind === "end")
    ).toHaveLength(1)
    // The network is read again after the end was decided: the kept detail
    // is stale and shows nothing until it is read again.
    setDetailReader(() => Promise.resolve(new Map()))
    const after = { ...network, sections: [{ ...listed, proposedEnds: [] }] }
    expect(
      inboxItems(after, current()).filter((i) => i.kind === "end")
    ).toHaveLength(0)
    expect(inboxCount(after)).toBe(inboxCount(before) - 1)
  })
})
