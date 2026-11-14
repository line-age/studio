import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

import { AgentSources } from "./agent-sources"
import { AgentStatementView } from "./agent-statement"
import { AgentSteps } from "./agent-steps"

/*
 * An answer's parts (Figma section 13), each its own look: the kind as a grey
 * prefix, sections as links in the sentence, what it rests on as a source
 * pill, the store reads folded above, the sources folded below. Invented data.
 */

const SECTION = "11111111-1111-4111-8111-111111111111"
const NEIGHBOUR = "44444444-4444-4444-8444-444444444444"
const name = () => null

const owner: AgentAnswerRef = {
  type: "claim",
  id: "c-1",
  feature_id: NEIGHBOUR,
  attribute: "owner",
  status: "accepted",
  label: "section 44444444",
  source: "Example Gazette, vol. 32 no. 3, p. 52",
}

const lead: AgentStatement = {
  kind: "lead",
  text: "section 44444444, drawn touching section 11111111, has the owner Invented Gas Co., in 1932. Worth checking whether that holds for section 11111111.",
  refs: [{ type: "feature", id: SECTION, label: "section 11111111" }, owner],
}

describe("a statement", () => {
  it("says its kind as a prefix, and its sections are links that open them", async () => {
    const open = vi.fn()
    render(<AgentStatementView statement={lead} name={name} open={open} />)
    expect(screen.getByText(/Lead, not in store ·/)).toBeInTheDocument()
    const links = screen.getAllByRole("button", { name: "section 11111111" })
    expect(links).toHaveLength(2)
    await userEvent.click(links[0])
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: SECTION }))
    await userEvent.click(
      screen.getByRole("button", { name: "section 44444444" })
    )
    expect(open).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: NEIGHBOUR })
    )
  })

  it("shows what it rests on as a source pill that opens the claim", async () => {
    const open = vi.fn()
    render(<AgentStatementView statement={lead} name={name} open={open} />)
    await userEvent.click(
      screen.getByRole("button", {
        name: /from Example Gazette, vol. 32 no. 3, p. 52/,
      })
    )
    expect(open).toHaveBeenCalledWith(owner)
  })

  it("says so when store holds no source, and a plain claim has no prefix", () => {
    const bare: AgentStatement = {
      kind: "fact",
      text: "The owner is Invented Gas Co., in 1932.",
      refs: [{ ...owner, source: null }],
    }
    render(<AgentStatementView statement={bare} name={name} open={vi.fn()} />)
    expect(screen.getByText("Store holds no source")).toBeInTheDocument()
    expect(screen.queryByText(/not in store ·|Worked out ·/)).toBeNull()
  })
})

describe("the steps above an answer", () => {
  const steps = [
    { text: "Read section 11111111", done: true },
    { text: "Read what surrounds section 11111111", done: true },
    { text: "Writing the answer", done: true },
    { text: "Checking the answer", done: true },
  ]

  it("are folded once done, counting the reads, and open on a click", async () => {
    render(<AgentSteps steps={steps} working={false} />)
    const trigger = screen.getByRole("button", {
      name: /Read 2 things in store/,
    })
    expect(
      screen.queryByRole("list", { name: "What the Agent did" })
    ).toBeNull()
    await userEvent.click(trigger)
    const list = screen.getByRole("list", { name: "What the Agent did" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(4)
  })

  it("are open while it works, with the step under way", () => {
    render(
      <AgentSteps
        steps={[steps[0], { text: "Writing the answer", done: false }]}
        working
      />
    )
    expect(screen.getByText("Reading store")).toBeInTheDocument()
    expect(screen.getByText("Writing the answer")).toBeInTheDocument()
  })

  it("counts a step that reads many as many", async () => {
    render(
      <AgentSteps
        steps={[{ text: "Read 10 sections and 2 pipelines", done: true }]}
        working={false}
      />
    )
    expect(
      screen.getByRole("button", { name: /Read 12 things in store/ })
    ).toBeInTheDocument()
  })
})

describe("the sources below an answer", () => {
  it("lists each source once and opens its claim", async () => {
    const open = vi.fn()
    const twice: AgentStatement = {
      kind: "fact",
      text: "Again.",
      refs: [owner],
    }
    render(<AgentSources statements={[lead, twice]} open={open} />)
    await userEvent.click(screen.getByRole("button", { name: /Used 1 source/ }))
    const list = screen.getByRole("list", { name: "Sources" })
    await userEvent.click(within(list).getByRole("button"))
    expect(open).toHaveBeenCalledWith(owner)
  })
})

describe("counting what was read", () => {
  it("says when nothing was read, and counts each kind", () => {
    const { unmount } = render(
      <AgentSteps
        steps={[{ text: "Checking the answer", done: true }]}
        working={false}
      />
    )
    expect(
      screen.getByRole("button", { name: /Wrote and checked the answer/ })
    ).toBeInTheDocument()
    unmount()
    render(
      <AgentSteps
        steps={[{ text: "Read 3 sections and 1 pipeline", done: true }]}
        working={false}
      />
    )
    expect(
      screen.getByRole("button", { name: /Read 4 things in store/ })
    ).toBeInTheDocument()
  })
})
