import { describe, expect, it } from "vitest"

import { evidenceNetwork } from "@/test/network"

import {
  buildQuestion,
  membershipRefs,
  proposalRefs,
  refKey,
  refWords,
  STARTERS,
} from "./question"

const network = evidenceNetwork()
const edition = network.editions[1]
const section = (id: string) => network.sections.find((s) => s.id === id)!

describe("a question for the Agent", () => {
  it("carries the words, each thing by kind and id, the edition and the network", () => {
    const question = buildQuestion({
      words: "  What does store say about this?  ",
      sections: [
        { pipelineId: "p-1", sectionIds: "all" },
        { pipelineId: "p-2", sectionIds: ["s-3"] },
      ],
      refs: [
        {
          kind: "claim",
          owner: "section",
          ownerId: "s-6",
          attribute: "Geometry",
        },
        ...proposalRefs(section("s-6"), "Last seen"),
      ],
      network,
      edition,
    })
    expect(question).toEqual({
      words: "What does store say about this?",
      about: [
        // A whole pipeline is asked about as the pipeline itself.
        { kind: "pipeline", id: "p-1" },
        { kind: "section", id: "s-3" },
        {
          kind: "claim",
          id: "c-6-geometry",
          on: { sectionId: "s-6", attribute: "Geometry" },
        },
        // A proposed end is a link in store.
        { kind: "link", id: "pe-1", on: { sectionId: "s-6" } },
      ],
      edition: { id: "ed-1937", year: 1937 },
      network: "Test network",
    })
  })

  it("says where a thing is when the data gives it no id", () => {
    const { about } = buildQuestion({
      words: "Why?",
      sections: [],
      refs: [
        {
          kind: "claim",
          owner: "pipeline",
          ownerId: "p-1",
          attribute: "Owner",
          index: 1,
        },
        { kind: "citation", sectionId: "s-1", attribute: "Diameter", index: 0 },
        ...proposalRefs(section("s-2"), "Diameter"),
        ...membershipRefs(section("s-4")),
      ],
      network,
      edition,
    })
    expect(about).toEqual([
      {
        kind: "claim",
        id: null,
        on: { pipelineId: "p-1", attribute: "Owner" },
      },
      {
        kind: "citation",
        id: null,
        on: { sectionId: "s-1", attribute: "Diameter" },
      },
      {
        kind: "claim",
        id: null,
        on: { sectionId: "s-2", attribute: "Diameter" },
      },
      { kind: "link", id: "pm-1", on: { sectionId: "s-4" } },
    ])
  })

  it("names each thing in words, with what it belongs to", () => {
    const [end] = proposalRefs(section("s-6"), "Last seen")
    expect(refWords(end, network)).toEqual({
      title: "Proposed end",
      meta: "Proposal · Fir to Gale",
    })
    expect(
      refWords(
        {
          kind: "claim",
          owner: "pipeline",
          ownerId: "p-1",
          attribute: "Owner",
        },
        network
      )
    ).toEqual({ title: "Owner", meta: "Claim · North line" })
    const [pipeline] = membershipRefs(section("s-4"))
    expect(refWords(pipeline, network).title).toBe("Proposed pipeline")
  })

  it("keys a thing the same way however it was reached", () => {
    const [a] = proposalRefs(section("s-2"), "Diameter")
    const [b] = proposalRefs(section("s-2"), "Diameter")
    expect(refKey(a)).toBe(refKey(b))
  })

  it("offers only questions that read", () => {
    expect(Object.values(STARTERS)).toEqual([
      "What does store say about this?",
      "Why is this Unknown?",
      "What is proposed here, and why?",
    ])
  })
})
