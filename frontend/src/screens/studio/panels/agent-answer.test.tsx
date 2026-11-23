import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

import { useStudio } from "../studio-store"
import { AgentSources } from "./agent-sources"
import { AgentStatementView, NOT_LOADED } from "./agent-statement"
import { AgentSteps } from "./agent-steps"

/*
 * An answer's parts (Figma section 13), each its own look: the kind as a grey
 * prefix, sections as links in the sentence, what it rests on as a source
 * pill, the store reads folded above, the sources folded below. Invented data.
 */

const SECTION = "11111111-1111-4111-8111-111111111111"
const NEIGHBOUR = "44444444-4444-4444-8444-444444444444"
const LOADED: Record<string, string> = {
  [SECTION]: "section 11111111",
  [NEIGHBOUR]: "section 44444444",
}
// What Studio has loaded, by name; anything else is outside the area it opened.
const name = (id: string) => LOADED[id] ?? null

const owner: AgentAnswerRef = {
  type: "claim",
  id: "c-1",
  feature_id: NEIGHBOUR,
  attribute: "owner",
  status: "accepted",
  label: "section 44444444",
  source: "Example Gazette, vol. 32 no. 3, p. 52",
}

const editOffer: AgentStatement = {
  kind: "edit_offer",
  text: "I filled in the Edit form: diameter 20 in for section 11111111. Open it, check it, add the source and save. Nothing is changed until you save.",
  refs: [{ type: "feature", id: SECTION, label: "section 11111111" }],
  edit: {
    target: "sections",
    feature_ids: [SECTION],
    attribute: "diameter",
    value: "20 in",
  },
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
    expect(screen.getByText(/Lead, not a fact ·/)).toBeInTheDocument()
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

  it("leaves a section Studio has not loaded as plain text, saying why", () => {
    const open = vi.fn()
    const onlySection = (id: string) => (id === SECTION ? LOADED[id] : null)
    render(
      <AgentStatementView statement={lead} name={onlySection} open={open} />
    )
    expect(
      screen.queryByRole("button", { name: "section 44444444" })
    ).toBeNull()
    expect(screen.getAllByText("section 44444444")[0]).toHaveAttribute(
      "title",
      NOT_LOADED
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
    expect(screen.queryByText(/not in store ·|Inferred ·/)).toBeNull()
  })
})

describe("a text with line breaks", () => {
  it("shows its paragraphs, and lines starting with a dash as a list", () => {
    const help: AgentStatement = {
      kind: "help",
      text: "I can tell you:\n- What is known\n- What is not\n\nNot yet: comparing.",
      refs: [],
    }
    render(<AgentStatementView statement={help} name={name} open={vi.fn()} />)
    expect(screen.getByText("I can tell you:")).toBeInTheDocument()
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual(["What is known", "What is not"])
    expect(screen.getByText("Not yet: comparing.")).toBeInTheDocument()
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
      name: /Read 2 things/,
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
    expect(screen.getByText("Reading the data")).toBeInTheDocument()
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
      screen.getByRole("button", { name: /Read 12 things/ })
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
      screen.getByRole("button", { name: /Read 4 things/ })
    ).toBeInTheDocument()
  })
})

describe("an inferred statement", () => {
  it("says what Inferred means when the word is hovered or focused", async () => {
    const inferred: AgentStatement = {
      kind: "worked_out",
      text: "section 11111111 is first shown on the 1932 map.",
      refs: [{ type: "feature", id: SECTION, label: "section 11111111" }],
    }
    render(
      <AgentStatementView statement={inferred} name={name} open={vi.fn()} />
    )
    await userEvent.tab()
    expect(await screen.findByText(/No source states this/)).toBeInTheDocument()
  })
})

describe("a source pill", () => {
  it("shows the passage and a link to the source on hover", async () => {
    const quoted: AgentStatement = {
      ...lead,
      refs: [
        {
          ...owner,
          quote: "Invented Gas Co. owns the line to Sampleton.",
          url: "https://example.org/gazette/32/3#page=52",
          role: "states",
        },
      ],
    }
    render(<AgentStatementView statement={quoted} name={name} open={vi.fn()} />)
    await userEvent.hover(
      screen.getByRole("button", { name: /Open the citation/ })
    )
    expect(
      await screen.findByText(/Invented Gas Co\. owns the line to Sampleton\./)
    ).toBeInTheDocument()
    expect(screen.getByText("States it")).toBeInTheDocument()
    expect(screen.getByText("Cited")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Open the source/ })
    ).toHaveAttribute("href", "https://example.org/gazette/32/3#page=52")
  })
})

describe("an edit the Agent prepared", () => {
  it("offers Open Edit, which opens the form on those sections with the value filled in", async () => {
    useStudio.setState({ editing: null })
    render(
      <AgentStatementView statement={editOffer} name={name} open={vi.fn()} />
    )
    expect(
      screen.getByText(/Nothing is changed until you save\./)
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Open Edit" }))
    // The form itself is tested in edit-sections-dialog.test.tsx: here, what it is opened with.
    expect(useStudio.getState().editing).toEqual({
      kind: "edit-sections",
      sectionIds: [SECTION],
      prefill: { Diameter: "20 in" },
    })
  })

  it("shows no button on any other kind of statement", () => {
    render(<AgentStatementView statement={lead} name={name} open={vi.fn()} />)
    expect(
      screen.queryByRole("button", { name: "Open Edit" })
    ).not.toBeInTheDocument()
  })
})

describe("an answer the Agent wrote, in its house shape", () => {
  const overview: AgentStatement = {
    kind: "answer",
    text: "It is a section in Oklahoma.\n\nKnown: its diameter is 12 in.\nNot known: its name, owner and operator.\nOn the map: section 11111111 is first shown on the 1932 map.",
    refs: [{ type: "feature", id: SECTION, label: "section 11111111" }],
  }

  it("sets each label apart on its own line, and keeps a named section a link", async () => {
    const open = vi.fn()
    render(<AgentStatementView statement={overview} name={name} open={open} />)
    for (const label of ["Known", "Not known", "On the map"])
      expect(screen.getByText(label)).toBeInTheDocument()
    expect(
      screen.getByText(/its name, owner and operator\./)
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "section 11111111" })
    )
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: SECTION }))
  })
})

describe("a value entered by hand", () => {
  it("is never shown as a citation", async () => {
    const byHand: AgentStatement = {
      kind: "answer",
      text: "Its diameter is 31 in.",
      refs: [{ ...owner, attribute: "diameter", source: "Studio edit" }],
    }
    render(<AgentStatementView statement={byHand} name={name} open={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: "Entered by hand, open it" })
    ).toHaveTextContent("Entered by hand")
    expect(screen.queryByText("Studio edit")).not.toBeInTheDocument()
    expect(screen.queryByText("Cited")).not.toBeInTheDocument()
  })
})
