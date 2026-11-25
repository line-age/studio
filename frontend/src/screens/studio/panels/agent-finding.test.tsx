import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { agentAnswer } from "@/data/agent/answer"
import { renderInStudio } from "@/test/in-studio"

import { AgentCards, type AgentCardsValue } from "./agent-cards"
import { PipelineOfSection, ProposeOutcomes } from "./agent-finding"
import { AgentStatementView, ProposeFinding } from "./agent-statement"

/*
 * What cite found, as one card (Figma section 29, board B), from the
 * service's own invented example: the value as the title, the page's words,
 * the source, how sure it is and why, where it goes, why it is in doubt,
 * Propose and Dismiss. A lead is shown and never proposed.
 */

const EXAMPLES = import.meta.glob(
  "../../../../../agent/contract/examples/answer-finding.json",
  { eager: true, import: "default" }
)
const answer = agentAnswer.parse(Object.values(EXAMPLES)[0])
const findings = answer.statements.filter((s) => s.kind === "finding")
const name = () => null
const first = findings[0]
const asOwner = {
  ...first,
  finding: { ...first.finding!, attribute: "owner" as const },
}

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

function card() {
  return screen.getByRole("article", { name: /^Finding F1/ })
}

describe("a finding", () => {
  it("shows the value, the page's words and its source, and says it is not saved", async () => {
    await renderInStudio(
      <AgentStatementView statement={first} name={name} open={vi.fn()} />
    )
    const it = within(card())
    expect(it.getByText(/^Found by cite, not saved/)).toBeVisible()
    expect(it.getByText(`“${first.finding!.quote}”`)).toBeVisible()
    expect(it.getByRole("link", { name: /Open page/ })).toHaveAttribute(
      "href",
      first.finding!.url
    )
  })

  it("sends an owner to the section's pipeline, or this section only", async () => {
    const propose = vi.fn()
    await renderInStudio(
      <AgentCards value={cards()}>
        <ProposeFinding value={propose}>
          <PipelineOfSection
            value={() => ({ id: "line-1", name: "North line" })}
          >
            <AgentStatementView
              statement={asOwner}
              name={name}
              open={vi.fn()}
            />
          </PipelineOfSection>
        </ProposeFinding>
      </AgentCards>
    )
    const user = userEvent.setup()
    expect(within(card()).getByText("Goes to")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Propose" }))
    expect(propose).toHaveBeenLastCalledWith("F1", "line-1")
    await user.click(screen.getByRole("button", { name: "This section only" }))
    expect(within(card()).queryByText("Goes to")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Propose" }))
    expect(propose).toHaveBeenLastCalledWith("F1", undefined)
  })

  it("says why it is in doubt", async () => {
    await renderInStudio(
      <AgentStatementView statement={findings[1]} name={name} open={vi.fn()} />
    )
    const reasons = findings[1].finding!.flags.map((f) => f.reason).join(" ")
    expect(screen.getByText(`In doubt: ${reasons}`)).toBeVisible()
  })

  it("proposes only when pressed, and only while the Agent may be asked", async () => {
    const propose = vi.fn()
    const view = await renderInStudio(
      <AgentCards value={cards()}>
        <ProposeFinding value={propose}>
          <AgentStatementView statement={first} name={name} open={vi.fn()} />
        </ProposeFinding>
      </AgentCards>
    )
    expect(propose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Propose" }))
    expect(propose).toHaveBeenCalledWith("F1", undefined)
    view.unmount()
    await renderInStudio(
      <AgentCards value={cards()}>
        <ProposeFinding value={null}>
          <AgentStatementView statement={first} name={name} open={vi.fn()} />
        </ProposeFinding>
      </AgentCards>
    )
    expect(screen.getByRole("button", { name: "Propose" })).toBeDisabled()
  })

  it("once proposed, says so and points to the inbox", async () => {
    await renderInStudio(
      <ProposeOutcomes
        value={
          new Map([["F1", { state: "proposed" as const, text: "Proposed." }]])
        }
      >
        <AgentStatementView statement={first} name={name} open={vi.fn()} />
      </ProposeOutcomes>
    )
    expect(within(card()).getByRole("status")).toHaveTextContent("Proposed")
    expect(screen.getByRole("button", { name: "Open in inbox" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Propose" })).toBeNull()
  })

  it("is dismissed in the thread, and then writes nothing", async () => {
    const report = vi.fn(async () => undefined)
    await renderInStudio(
      <AgentCards value={cards({ report })}>
        <ProposeFinding value={vi.fn()}>
          <AgentStatementView statement={first} name={name} open={vi.fn()} />
        </ProposeFinding>
      </AgentCards>
    )
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(report).toHaveBeenCalledWith("F1", "dismissed")
  })

  it("reads Dismissed for everyone once the thread holds it", async () => {
    await renderInStudio(
      <AgentCards value={cards({ outcome: () => ({ state: "dismissed" }) })}>
        <ProposeFinding value={vi.fn()}>
          <AgentStatementView statement={first} name={name} open={vi.fn()} />
        </ProposeFinding>
      </AgentCards>
    )
    expect(within(card()).getByRole("status")).toHaveTextContent("Dismissed")
    expect(screen.queryByRole("button", { name: "Propose" })).toBeNull()
  })
})

describe("a finding store already holds", () => {
  it("says it is already proposed and offers no Propose", async () => {
    const held = {
      ...first,
      finding: {
        ...first.finding!,
        in_store: "candidate" as const,
        proposable: false,
        not_proposable: "store already holds it (a candidate)",
      },
    }
    await renderInStudio(
      <ProposeFinding value={vi.fn()}>
        <AgentStatementView statement={held} name={name} open={vi.fn()} />
      </ProposeFinding>
    )
    expect(within(card()).getByRole("status")).toHaveTextContent(
      "Already proposed"
    )
    expect(screen.queryByRole("button", { name: "Propose" })).toBeNull()
  })
})

describe("how sure a finding is", () => {
  it("shows the confidence, how many checks passed and which did not", async () => {
    await renderInStudio(
      <AgentStatementView statement={first} name={name} open={vi.fn()} />
    )
    const it = within(card())
    expect(it.getByText("0.85, 4 of 5 checks")).toBeVisible()
    expect(
      it.getByText(/^The quote is on the page, word for word\./)
    ).toBeVisible()
    expect(it.getByText("A second source says the same.")).toBeVisible()
  })

  it("names the document and the source it is held by, and shows no page image", async () => {
    await renderInStudio(
      <AgentStatementView statement={first} name={name} open={vi.fn()} />
    )
    const it = within(card())
    expect(
      it.getByText(`${first.finding!.title} · ${first.finding!.source}`)
    ).toBeVisible()
    expect(it.queryByRole("img")).toBeNull()
    expect(it.queryByRole("button", { name: "Show the page" })).toBeNull()
  })
})

describe("a lead", () => {
  const lead = findings[1]

  it("says it is a lead and why, keeps its link, and offers no Propose", async () => {
    await renderInStudio(
      <AgentCards value={cards()}>
        <ProposeFinding value={vi.fn()}>
          <AgentStatementView statement={lead} name={name} open={vi.fn()} />
        </ProposeFinding>
      </AgentCards>
    )
    const it = within(screen.getByRole("article", { name: /^Finding F2/ }))
    expect(it.getByText(/^A lead found by cite, not saved/)).toBeVisible()
    expect(it.getByRole("status")).toHaveTextContent(
      "A lead, not offered to propose"
    )
    expect(it.getByRole("status")).toHaveTextContent(
      lead.finding!.not_proposable!
    )
    expect(it.getByRole("link", { name: /Open page/ })).toHaveAttribute(
      "href",
      lead.finding!.url
    )
    expect(it.queryByRole("button", { name: "Propose" })).toBeNull()
    expect(it.getByRole("button", { name: "Dismiss" })).toBeVisible()
  })
})
