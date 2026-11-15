import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { agentAnswer } from "@/data/agent/answer"

import { AgentStatementView, ProposeFinding } from "./agent-statement"

/*
 * What cite found, as the service sends it (its own invented example): the
 * sentence, then the passage, the page, the reference, the doubt and Propose.
 */

const EXAMPLES = import.meta.glob(
  "../../../../../agent/contract/examples/answer-finding.json",
  { eager: true, import: "default" }
)
const answer = agentAnswer.parse(Object.values(EXAMPLES)[0])
const findings = answer.statements.filter((s) => s.kind === "finding")
const name = () => null

describe("a finding", () => {
  it("shows the passage, the page and a link to it, and is not in store", () => {
    render(
      <AgentStatementView statement={findings[0]} name={name} open={vi.fn()} />
    )
    const card = screen.getByLabelText("Finding F1")
    expect(within(card).getByText("Found by cite, not in store")).toBeVisible()
    expect(within(card).getByText(findings[0].finding!.quote)).toBeVisible()
    expect(
      within(card).getByRole("link", { name: "Open page on Internet Archive" })
    ).toHaveAttribute("href", findings[0].finding!.url)
    expect(within(card).getByRole("img")).toBeInTheDocument()
  })

  it("says why it is in doubt", () => {
    render(
      <AgentStatementView statement={findings[1]} name={name} open={vi.fn()} />
    )
    expect(screen.getByText("In doubt")).toBeVisible()
    const reasons = screen.getByRole("list", { name: "Why it is in doubt" })
    expect(within(reasons).getAllByRole("listitem")).toHaveLength(2)
  })

  it("proposes only when pressed, and only while the Agent may be asked", async () => {
    const propose = vi.fn()
    const { rerender } = render(
      <ProposeFinding value={propose}>
        <AgentStatementView
          statement={findings[0]}
          name={name}
          open={vi.fn()}
        />
      </ProposeFinding>
    )
    expect(propose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Propose" }))
    expect(propose).toHaveBeenCalledWith("F1")
    rerender(
      <ProposeFinding value={null}>
        <AgentStatementView
          statement={findings[0]}
          name={name}
          open={vi.fn()}
        />
      </ProposeFinding>
    )
    expect(screen.queryByRole("button", { name: "Propose" })).toBeNull()
  })
})

describe("a finding store already holds", () => {
  it("says so and offers no Propose", () => {
    const held = {
      ...findings[0],
      finding: {
        ...findings[0].finding!,
        in_store: "candidate" as const,
        proposable: false,
        not_proposable: "store already holds it (a candidate)",
      },
    }
    render(
      <ProposeFinding value={vi.fn()}>
        <AgentStatementView statement={held} name={name} open={vi.fn()} />
      </ProposeFinding>
    )
    expect(
      screen.getByText("Found by cite, in store as a candidate")
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: "Propose" })).toBeNull()
  })
})
