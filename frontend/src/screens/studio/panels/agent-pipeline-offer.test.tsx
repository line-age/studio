import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { agentAnswer } from "@/data/agent/answer"

import { AgentStatementView, ProposePipeline } from "./agent-statement"

/*
 * The Agent offers to propose the attached sections as one pipeline (its own
 * invented example). Nothing is written until the person presses the button,
 * and then only as a proposal a person decides in the inbox.
 */

const EXAMPLES = import.meta.glob(
  "../../../../../agent/contract/examples/answer-pipeline-offer.json",
  { eager: true, import: "default" }
)
const answer = agentAnswer.parse(Object.values(EXAMPLES)[0])
const offer = answer.statements.find((s) => s.kind === "pipeline_offer")!

describe("a pipeline offer", () => {
  it("sends the sections on Propose pipeline, and only then", async () => {
    const propose = vi.fn()
    render(
      <ProposePipeline value={propose}>
        <AgentStatementView
          statement={offer}
          name={() => null}
          open={vi.fn()}
        />
      </ProposePipeline>
    )
    expect(propose).not.toHaveBeenCalled()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Propose pipeline" }))
    expect(propose).toHaveBeenCalledWith(offer.pipeline!.section_ids)
  })

  it("cannot be pressed while the Agent works", () => {
    render(
      <AgentStatementView statement={offer} name={() => null} open={vi.fn()} />
    )
    expect(
      screen.getByRole("button", { name: "Propose pipeline" })
    ).toBeDisabled()
  })
})
