import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { AgentCards } from "./agent-cards"
import { AgentNotice } from "./agent-notice"

/**
 * A fixed line, written by code (Figma section 28 board C 5; section 29
 * board C): what happened, what it means, at most one way on.
 */
const cards = {
  outcome: () => undefined,
  search: () => undefined,
  report: null,
  start: null,
  stop: fn(),
  ask: fn(),
  draft: fn(),
}

const meta = {
  title: "Studio/Agent/Notice",
  component: AgentNotice,
  decorators: [
    (Story) => (
      <AgentCards value={cards}>
        <div className="w-104">
          <Story />
        </div>
      </AgentCards>
    ),
  ],
  args: {
    statement: {
      kind: "refusal",
      text: "I cannot delete anything. A section in the wrong pipeline can be removed from it.",
      refs: [],
    },
  },
} satisfies Meta<typeof AgentNotice>

export default meta
type Story = StoryObj<typeof meta>

/** Something the Agent does not do: a cross, the line, what to do instead. */
export const Refusal: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("I cannot delete anything.")).toBeVisible()
    await expect(
      canvas.getByText(
        "A section in the wrong pipeline can be removed from it."
      )
    ).toBeVisible()
  },
}

/** A search that found nothing: two ways on, each words in the box, never a run. */
export const NotFound: Story = {
  name: "Searched, not found",
  args: {
    statement: {
      kind: "searched",
      text: "Searched, not found: the owner of S-0142. 2 searches of Example Gazette, 24 issues from 1 January 1931 to 31 December 1932.",
      refs: [],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Change towns" }))
    await expect(cards.draft).toHaveBeenCalledWith("Search by ")
  },
}

/** The search could not finish: the red mark with its words. */
export const SearchFailed: Story = {
  name: "Search failed",
  args: {
    statement: {
      kind: "searched",
      text: "The search could not finish. Nothing was found and nothing was written.",
      refs: [],
    },
  },
}
