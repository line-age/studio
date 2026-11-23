import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { agentAnswer, type AgentStatement } from "@/data/agent/answer"
import { renderInStudio } from "@/test/in-studio"

import { AgentCards, type AgentCardsValue, type SearchRun } from "./agent-cards"
import { yearsWords } from "./agent-search-card"
import { AgentStatementView } from "./agent-statement"

/*
 * A search offered before it runs (Figma section 29, board A), from the
 * service's own invented example. Only Search starts it; Not now and Change
 * towns spend nothing; while it runs the card follows it.
 */

const EXAMPLES = import.meta.glob(
  "../../../../../agent/contract/examples/answer-search-offer.json",
  { eager: true, import: "default" }
)
const offer = agentAnswer.parse(Object.values(EXAMPLES)[0]).statements[0]

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

async function show(statement: AgentStatement, value = cards()) {
  await renderInStudio(
    <AgentCards value={value}>
      <AgentStatementView
        statement={statement}
        name={() => null}
        open={vi.fn()}
      />
    </AgentCards>
  )
  return { user: userEvent.setup(), value }
}

const running = (run: SearchRun) => cards({ search: () => run })

describe("a search card", () => {
  it("reads out the search, and starts it only on Search", async () => {
    const { user, value } = await show(offer)
    const card = within(screen.getByRole("article"))
    expect(card.getByText("Search the journals for the owner")).toBeVisible()
    expect(card.getByText(/A paid search by cite/)).toBeVisible()
    expect(card.getByText("1931 and 1932")).toBeVisible()
    expect(card.getByText("Sampleton")).toBeVisible()
    expect(value.start).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Search" }))
    expect(value.start).toHaveBeenCalledWith(offer.search!.id)
    // At once, the card follows the search it started.
    expect(
      screen.getByRole("button", { name: "Stop the search" })
    ).toBeVisible()
  })

  it("is not run on Not now, and says so in the thread", async () => {
    const { user, value } = await show(offer)
    await user.click(screen.getByRole("button", { name: "Not now" }))
    expect(value.report).toHaveBeenCalledWith(offer.search!.id, "declined")
  })

  it("puts the towns in the message box for the person to change", async () => {
    const { user, value } = await show(offer)
    await user.click(screen.getByRole("button", { name: "Change towns" }))
    expect(value.draft).toHaveBeenCalledWith("Search by Sampleton")
  })

  it("waits for a town when there is nothing to search by", async () => {
    await show({
      ...offer,
      search: { ...offer.search!, ready: false, places: [] },
    })
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
    expect(
      screen.getByText("None. It has no name to search by either.")
    ).toBeVisible()
    expect(screen.getByText(/Say a town it runs through/)).toBeVisible()
  })

  it("follows the search while it runs, and Stop ends it", async () => {
    const value = running({
      state: "searching",
      steps: ["Found 23 pages", "Reading page 14 of 23"],
    })
    const { user } = await show(offer, value)
    expect(
      screen.getByRole("heading", {
        name: "Searching the journals for the owner",
      })
    ).toBeVisible()
    expect(screen.getByText("Reading page 14 of 23")).toBeVisible()
    expect(screen.getByRole("progressbar")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Stop the search" }))
    expect(value.stop).toHaveBeenCalled()
  })

  it.each<[SearchRun, string]>([
    [
      { state: "done", statements: [] },
      "Nothing was found. What was read is below.",
    ],
    [
      {
        state: "done",
        statements: [
          { kind: "finding", text: "", refs: [] },
          { kind: "finding", text: "", refs: [] },
        ],
      },
      "Found 2 passages, below.",
    ],
    [
      { state: "stopped" },
      "The search was stopped. Nothing was found and nothing was written.",
    ],
    [
      { state: "refused", text: "A search is already running." },
      "A search is already running.",
    ],
  ])("closes with what came of it: %#", async (run, words) => {
    await show(offer, running(run))
    expect(screen.getByRole("status")).toHaveTextContent(words)
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull()
  })

  it("reads Not searched once the thread holds Not now", async () => {
    await show(offer, cards({ outcome: () => ({ state: "declined" }) }))
    expect(screen.getByRole("status")).toHaveTextContent("Not searched")
  })

  it("cannot be pressed while the Agent works", async () => {
    await show(offer, cards({ start: null, report: null }))
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled()
  })
})

describe("the years a search reads", () => {
  it.each<[number[], string]>([
    [[], "Nearest the first map that shows it"],
    [[1931, 1931], "1931"],
    [[1931, 1932], "1931 and 1932"],
    [[1930, 1933], "1930 to 1933"],
  ])("%j reads %s", (years, words) => {
    expect(yearsWords(years)).toBe(words)
  })
})
