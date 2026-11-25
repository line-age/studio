import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { inStudio, type CardStoryArgs } from "@/test/studio-story"

import { AgentSearchCard } from "./agent-search-card"

/**
 * A search of our sources, offered before it runs (Figma section 29, board
 * A), on the invented test network. Only Search spends; the card follows it.
 */
type Args = React.ComponentProps<typeof AgentSearchCard> & CardStoryArgs

const meta = {
  title: "Studio/Agent/SearchCard",
  component: AgentSearchCard,
  decorators: [inStudio()],
  // The grey block's colours: a token question for Figma (see DecisionCard).
  parameters: { a11y: { test: "todo" } },
  args: {
    title: "Search our sources for the owner",
    offer: {
      id: "search-1",
      section_id: "s-1",
      attributes: ["owner"],
      years: [1931, 1932],
      places: ["Alder", "Birch"],
      from_line: true,
      ready: true,
      web_searches: 6,
      pages: 6,
    },
    onReport: fn(),
    onStart: fn(),
    onStop: fn(),
    onAsk: fn(),
    onDraft: fn(),
  },
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

/** Ready: nothing runs until Search; Change towns puts words in the box. */
export const Ready: Story = {
  play: async ({ canvas, userEvent, args, step }) => {
    await step("Change towns spends nothing", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Change towns" })
      )
      await expect(args.onDraft).toHaveBeenCalledWith("Search by Alder, Birch")
      await expect(args.onStart).not.toHaveBeenCalled()
    })
    await step("Search starts it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Search" }))
      await expect(args.onStart).toHaveBeenCalledWith("search-1")
    })
  },
}

/** No towns to search by: Search waits for one. */
export const NeedsTowns: Story = {
  name: "Needs towns",
  args: {
    offer: {
      id: "search-2",
      section_id: "s-4",
      attributes: ["owner"],
      years: [],
      places: [],
      from_line: false,
      ready: false,
      web_searches: 6,
      pages: 6,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Search" })).toBeDisabled()
  },
}

/** Searching: cite's steps and a bar; Stop ends it. */
export const Searching: Story = {
  args: {
    run: {
      state: "searching",
      steps: [
        "Found 23 pages that name Alder or Birch",
        "Reading page 14 of 23",
      ],
    },
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Stop the search" })
    )
    await expect(args.onStop).toHaveBeenCalled()
  },
}

/** Done: what was found follows the card. */
export const Done: Story = {
  args: {
    run: {
      state: "done",
      statements: [
        { kind: "finding", text: "Found", refs: [] },
        { kind: "finding", text: "Found", refs: [] },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Found 2 passages, below."
    )
  },
}

/** Stopped: nothing found, nothing written. */
export const Stopped: Story = { args: { run: { state: "stopped" } } }

/** Not now: grey, nothing spent. */
export const NotNow: Story = {
  name: "Not now",
  args: { outcome: { state: "declined" } },
}
