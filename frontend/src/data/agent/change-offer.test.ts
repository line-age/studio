import { describe, expect, it } from "vitest"

import { testNetwork } from "@/test/network"

import { applyChange, type Change } from "../changes"
import { applySectionEdits } from "../derive"
import type { ChangeOffer } from "./answer"
import { doneWords, staleness, writeFor } from "./change-offer"

/*
 * A change the Agent offered, made by Studio: the same write as the menu path,
 * checked against the network before it is sent. On the invented test network:
 * North line (p-1) holds s-1 and s-2; South line (p-2) holds s-3, s-5, s-6;
 * s-4 is in no pipeline.
 */

const offer = (fields: Partial<ChangeOffer>): ChangeOffer => ({
  id: "offer-1",
  kind: "add",
  section_ids: [],
  left_out: [],
  basis: [],
  ...fields,
})

/** The menu path's change for the same thing, made on the sample. */
function viaMenu(change: Change) {
  return applyChange(testNetwork(), change, "offer-1")
}

/** The card's write, made on the sample. */
function viaCard(o: ChangeOffer) {
  const write = writeFor(o)
  return write.kind === "change"
    ? applyChange(testNetwork(), write.change, "offer-1")
    : applySectionEdits(testNetwork(), write.sectionIds, write.edits, "")
}

describe("the write for a card", () => {
  it.each<[string, ChangeOffer, Change]>([
    [
      "add",
      offer({ kind: "add", section_ids: ["s-4"], pipeline_id: "p-1" }),
      {
        kind: "place",
        sectionIds: ["s-4"],
        target: { kind: "pipeline", pipelineId: "p-1" },
      },
    ],
    [
      "move",
      offer({ kind: "move", section_ids: ["s-3"], pipeline_id: "p-1" }),
      {
        kind: "place",
        sectionIds: ["s-3"],
        target: { kind: "pipeline", pipelineId: "p-1" },
      },
    ],
    [
      "remove",
      offer({ kind: "remove", section_ids: ["s-1", "s-3"] }),
      { kind: "place", sectionIds: ["s-1", "s-3"], target: { kind: "none" } },
    ],
    [
      "make, named",
      offer({ kind: "make", section_ids: ["s-4", "s-3"], name: "Calder" }),
      {
        kind: "place",
        sectionIds: ["s-4", "s-3"],
        target: { kind: "new", name: "Calder" },
      },
    ],
    [
      "make, with no name",
      offer({ kind: "make", section_ids: ["s-4", "s-3"] }),
      { kind: "place", sectionIds: ["s-4", "s-3"], target: { kind: "new" } },
    ],
    [
      "rename",
      offer({ kind: "rename", pipeline_id: "p-2", name: "Lower main" }),
      {
        kind: "edit-pipeline",
        pipelineId: "p-2",
        edits: [{ attribute: "Name", value: "Lower main" }],
        note: "",
      },
    ],
    [
      "a pipeline's owner",
      offer({
        kind: "edit",
        pipeline_id: "p-2",
        attribute: "owner",
        value: "Elm Gas Co.",
      }),
      {
        kind: "edit-pipeline",
        pipelineId: "p-2",
        edits: [{ attribute: "Owner", value: "Elm Gas Co." }],
        note: "",
      },
    ],
  ])("%s leaves the network as the menu does", (_, card, menu) => {
    expect(writeFor(card)).toEqual({ kind: "change", change: menu })
    expect(viaCard(card)).toEqual(viaMenu(menu))
  })

  it("sets a typed diameter on sections as the Edit window saves it", () => {
    const card = offer({
      kind: "edit",
      section_ids: ["s-3", "s-4"],
      attribute: "diameter",
      value: "16 in",
    })
    expect(writeFor(card)).toEqual({
      kind: "section-edits",
      sectionIds: ["s-3", "s-4"],
      edits: [{ attribute: "Diameter", value: "16 in" }],
    })
    expect(viaCard(card)).toEqual(
      applySectionEdits(
        testNetwork(),
        ["s-3", "s-4"],
        [{ attribute: "Diameter", value: "16 in" }],
        ""
      )
    )
  })
})

describe("whether the card is still true", () => {
  it("is when every section is where the card says", () => {
    const card = offer({
      section_ids: ["s-4"],
      pipeline_id: "p-1",
      basis: [{ section_id: "s-4", pipeline_id: null }],
    })
    expect(staleness(card, testNetwork())).toBeNull()
  })

  it("is out of date when a section moved since", () => {
    const card = offer({
      section_ids: ["s-3"],
      pipeline_id: "p-1",
      basis: [{ section_id: "s-3", pipeline_id: null }],
    })
    expect(staleness(card, testNetwork())).toBe(
      "Dale to Elm was moved to South line after this was offered."
    )
  })

  it("is out of date when a section left its pipeline since", () => {
    const card = offer({
      kind: "remove",
      section_ids: ["s-4"],
      basis: [{ section_id: "s-4", pipeline_id: "p-1" }],
    })
    expect(staleness(card, testNetwork())).toMatch(
      /was taken out of its pipeline after this was offered\.$/
    )
  })

  it("is out of date when a section or the pipeline is gone", () => {
    expect(
      staleness(
        offer({ basis: [{ section_id: "s-gone", pipeline_id: null }] }),
        testNetwork()
      )
    ).toBe("A section on the card is no longer there.")
    expect(staleness(offer({ pipeline_id: "p-gone" }), testNetwork())).toBe(
      "The pipeline on the card is no longer there."
    )
  })
})

describe("the words once it is made", () => {
  it.each<[ChangeOffer, string]>([
    [
      offer({ kind: "add", section_ids: ["s-3", "s-4"], pipeline_id: "p-1" }),
      "2 sections are in North line.",
    ],
    [
      offer({ kind: "add", section_ids: ["s-4"], pipeline_id: "p-1" }),
      "Unnamed section is in North line.",
    ],
    [
      offer({ kind: "remove", section_ids: ["s-1"] }),
      "Alder to Birch is in no pipeline.",
    ],
    [
      offer({ kind: "make", section_ids: ["s-3", "s-4"], name: "Calder" }),
      "Calder holds 2 sections.",
    ],
    [
      offer({ kind: "make", section_ids: ["s-3", "s-4"] }),
      "A new pipeline holds 2 sections.",
    ],
    [
      offer({ kind: "rename", pipeline_id: "p-2", name: "Lower main" }),
      "The pipeline is named Lower main.",
    ],
    [
      offer({
        kind: "edit",
        section_ids: ["s-3", "s-4"],
        attribute: "diameter",
        value: "16 in",
      }),
      "Diameter is 16 in on 2 sections.",
    ],
    [
      offer({
        kind: "edit",
        pipeline_id: "p-2",
        attribute: "owner",
        value: "Elm Gas Co.",
      }),
      "Owner of South line is Elm Gas Co.",
    ],
  ])("%#: %s", (card, words) => {
    expect(doneWords(card, testNetwork())).toBe(words)
  })
})
