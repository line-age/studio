import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AgentStatement, ChangeOffer } from "@/data/agent/answer"
import { pipelineLabel } from "@/data/derive"
import type { Network } from "@/data/schema"
import { renderInStudio } from "@/test/in-studio"
import { testNetwork } from "@/test/network"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { AgentCards, CardQuestion, type AgentCardsValue } from "./agent-cards"
import { AgentStatementView } from "./agent-statement"

/*
 * A change asked for in words, as a card (Figma section 28): nothing changes
 * until Approve, which makes it as the menu would; a card no longer true is
 * out of date and writes nothing. On the invented test network: North line
 * (p-1) holds s-1 and s-2, South line (p-2) holds s-3; s-4, "Unnamed
 * section", is in no pipeline.
 */

/** What the screen holds now: the pipeline of s-4 and of s-3, and s-4's diameter. */
function Probe() {
  const { network } = useStudioData()
  const where = (id: string) => {
    const section = network.sections.find((s) => s.id === id)
    const pipeline = network.pipelines.find((p) => p.id === section?.pipelineId)
    return pipeline ? pipelineLabel(pipeline) : "none"
  }
  const diameter = network.sections
    .find((s) => s.id === "s-4")
    ?.values.find((v) => v.attribute === "Diameter")?.value
  return (
    <output aria-label="Probe">
      {`s-4 in ${where("s-4")}; s-3 in ${where("s-3")}; s-4 diameter ${diameter ?? "Unknown"}`}
    </output>
  )
}

const offer = (fields: Partial<ChangeOffer>): AgentStatement => ({
  kind: "change_offer",
  text: "Add Unnamed section to North line",
  refs: [],
  change: {
    id: "offer-1",
    kind: "add",
    section_ids: ["s-4"],
    pipeline_id: "p-1",
    left_out: [],
    basis: [{ section_id: "s-4", pipeline_id: null }],
    ...fields,
  },
})

const cards = (more: Partial<AgentCardsValue> = {}): AgentCardsValue => ({
  outcome: () => undefined,
  search: () => undefined,
  report: vi.fn(async () => undefined),
  start: vi.fn(),
  stop: vi.fn(),
  ask: vi.fn(),
  draft: vi.fn(),
  ...more,
})

async function show(
  statement: AgentStatement,
  value = cards(),
  readAgain?: () => Promise<Network | null>
) {
  await renderInStudio(
    <AgentCards value={value}>
      <CardQuestion
        value={{ words: "Add this to North line", about: [], network: "gas" }}
      >
        <AgentStatementView
          statement={statement}
          name={() => null}
          open={vi.fn()}
        />
      </CardQuestion>
      <Probe />
    </AgentCards>,
    testNetwork(),
    readAgain
  )
  return { user: userEvent.setup(), value }
}

const probe = () => screen.getByRole("status", { name: "Probe" })
const card = () => screen.getByRole("article", { name: /North line|diameter/ })

beforeEach(() => {
  act(() => useStudio.setState({ selection: new Set(), editing: null }))
})

describe("a change card", () => {
  it("says what will be written, and changes nothing before Approve", async () => {
    await show(offer({}))
    const it = within(card())
    expect(it.getByText("Your change. Made when you approve.")).toBeVisible()
    expect(it.getByText("Unnamed section")).toBeVisible()
    expect(it.getByText("North line · P-001")).toBeVisible()
    expect(probe()).toHaveTextContent("s-4 in none")
  })

  it("makes the change on Approve, as the menu would, and says it is done", async () => {
    const { user, value } = await show(offer({}))
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(await within(card()).findByRole("status")).toHaveTextContent("Done")
    expect(probe()).toHaveTextContent("s-4 in North line")
    expect(value.report).toHaveBeenCalledWith(
      "offer-1",
      "done",
      expect.stringMatching(/^Unnamed section is in North line\. By you, /)
    )
  })

  it("writes nothing when what it showed is no longer true", async () => {
    // The card says s-3 was in no pipeline; it is in South line.
    const { user, value } = await show(
      offer({
        kind: "add",
        section_ids: ["s-3"],
        basis: [{ section_id: "s-3", pipeline_id: null }],
      })
    )
    await user.click(screen.getByRole("button", { name: "Approve" }))
    await within(card()).findByRole("status")
    expect(probe()).toHaveTextContent("s-3 in South line")
    expect(value.report).toHaveBeenCalledWith(
      "offer-1",
      "out_of_date",
      "Dale to Elm was moved to South line after this was offered."
    )
    expect(within(card()).getByRole("status")).toHaveTextContent(
      "Out of date. Nothing was changed."
    )
    await user.click(screen.getByRole("button", { name: "Ask again" }))
    expect(value.ask).toHaveBeenCalledWith(
      expect.objectContaining({ words: "Add this to North line" })
    )
  })

  it("is declined in the thread, and changes nothing", async () => {
    const { user, value } = await show(offer({}))
    await user.click(screen.getByRole("button", { name: "Decline" }))
    expect(value.report).toHaveBeenCalledWith("offer-1", "declined", undefined)
    expect(within(card()).getByRole("status")).toHaveTextContent("Declined")
    expect(probe()).toHaveTextContent("s-4 in none")
  })

  it("reads what the thread holds, for everyone: done, with Show on map", async () => {
    const { user } = await show(
      offer({}),
      cards({
        outcome: () => ({
          state: "done",
          detail:
            "Unnamed section is in North line. By you, 23 Nov 2026, 14:02.",
        }),
      })
    )
    expect(within(card()).getByRole("status")).toHaveTextContent(
      "By you, 23 Nov 2026, 14:02."
    )
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Show on map" }))
    expect([...useStudio.getState().selection]).toEqual(["s-4"])
  })

  it("cannot be pressed while the Agent works", async () => {
    await show(offer({}), cards({ report: null }))
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled()
  })

  it("names the note the Agent wrote", async () => {
    await show(offer({ note: "Dale to Elm is already in North line." }))
    expect(
      within(card()).getByText("Dale to Elm is already in North line.")
    ).toBeVisible()
  })
})

describe("an edit card", () => {
  const diameter = offer({
    kind: "edit",
    section_ids: ["s-4"],
    pipeline_id: null,
    attribute: "diameter",
    value: "16 in",
  })
  const edit = { ...diameter, text: "Set the diameter of Unnamed section" }

  it("saves the typed value as the Edit window does", async () => {
    const { user } = await show(edit)
    expect(
      within(card()).getByText(
        "Your edit. Saved as yours, as the Edit window does."
      )
    ).toBeVisible()
    expect(within(card()).getByText("Entered by hand")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() => expect(probe()).toHaveTextContent("s-4 diameter 16 in"))
  })

  it("opens the Edit window filled in, for a change before saving", async () => {
    const { user } = await show(edit)
    await user.click(screen.getByRole("button", { name: "Open in Edit" }))
    expect(useStudio.getState().editing).toEqual({
      kind: "edit-sections",
      sectionIds: ["s-4"],
      prefill: { Diameter: "16 in" },
    })
  })
})

describe("the check just before the write (found in review)", () => {
  it("checks the card against what was just read, not what was on screen", async () => {
    // Elsewhere, Unnamed section was put in South line after the card was offered.
    const moved = (): Network => {
      const n = testNetwork()
      return {
        ...n,
        sections: n.sections.map((s) =>
          s.id === "s-4" ? { ...s, pipelineId: "p-2" } : s
        ),
      }
    }
    const { user, value } = await show(offer({}), cards(), async () => moved())
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(await within(card()).findByRole("status")).toHaveTextContent(
      "Out of date. Nothing was changed."
    )
    expect(value.report).toHaveBeenCalledWith(
      "offer-1",
      "out_of_date",
      "Unnamed section was moved to South line after this was offered."
    )
  })

  it("writes nothing when the data could not be read again", async () => {
    const { user, value } = await show(offer({}), cards(), async () => null)
    await user.click(screen.getByRole("button", { name: "Approve" }))
    expect(await within(card()).findByRole("status")).toHaveTextContent(
      "Couldn't save. Nothing was changed."
    )
    expect(value.report).toHaveBeenCalledWith(
      "offer-1",
      "failed",
      "Studio could not read the data again, so nothing was written."
    )
    expect(probe()).toHaveTextContent("s-4 in none")
  })
})
