import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { inStudio, type CardStoryArgs } from "@/test/studio-story"

import { AgentChangeCard } from "./agent-change-card"

/**
 * A change asked for in words, as the chat shows it (Figma section 28, board
 * A uses 1 and 2, board B states), on the invented test network: North line
 * holds Alder to Birch and Birch to Cedar; Unnamed section is in no pipeline.
 */
type Args = React.ComponentProps<typeof AgentChangeCard> & CardStoryArgs

const meta = {
  title: "Studio/Agent/ChangeCard",
  component: AgentChangeCard,
  decorators: [inStudio()],
  // The grey block's colours: a token question for Figma (see DecisionCard).
  parameters: { a11y: { test: "todo" } },
  args: {
    title: "Add Unnamed section to North line",
    offer: {
      id: "offer-1",
      kind: "add",
      section_ids: ["s-4"],
      pipeline_id: "p-1",
      left_out: [],
      basis: [{ section_id: "s-4", pipeline_id: null }],
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

/** Waiting for a press; Approve makes it and the card says Done. */
export const Waiting: Story = {
  play: async ({ canvas, userEvent, args, step }) => {
    await step("Approve makes it, as the menu would", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Approve" }))
      await expect(await canvas.findByRole("status")).toHaveTextContent("Done")
      await expect(args.onReport).toHaveBeenCalledWith(
        "offer-1",
        "done",
        expect.stringMatching(/^Unnamed section is in North line\./)
      )
    })
  },
}

/** Declined: grey, nothing changed. */
export const Declined: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }))
    await expect(args.onReport).toHaveBeenCalledWith(
      "offer-1",
      "declined",
      undefined
    )
    await expect(canvas.getByRole("status")).toHaveTextContent("Declined")
  },
}

/** Out of date: what it showed is no longer true, so nothing is written. */
export const OutOfDate: Story = {
  name: "Out of date",
  args: {
    title: "Add Dale to Elm to North line",
    offer: {
      id: "offer-2",
      kind: "add",
      section_ids: ["s-3"],
      pipeline_id: "p-1",
      left_out: [],
      basis: [{ section_id: "s-3", pipeline_id: null }],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }))
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Out of date. Nothing was changed."
    )
  },
}

/** Done, as the thread holds it for everyone: who and when, and Show on map. */
export const Done: Story = {
  args: {
    outcome: {
      state: "done",
      detail: "Unnamed section is in North line. By you, 23 Nov 2026, 14:02.",
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Show on map" })
    ).toBeVisible()
  },
}

/** Failed: the reason, Try again and Decline. */
export const Failed: Story = {
  args: {
    outcome: {
      state: "failed",
      detail: "Unnamed section belongs to another network.",
    },
  },
}

/** While the Agent works nothing can be pressed. */
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeDisabled()
  },
}

/** Make a pipeline, named, with a section that moves. */
export const MakePipeline: Story = {
  name: "Make pipeline",
  args: {
    title: "Make a pipeline of 2 sections, named Calder",
    offer: {
      id: "offer-3",
      kind: "make",
      section_ids: ["s-4", "s-3"],
      name: "Calder",
      left_out: [],
      note: "Dale to Elm is in South line now. It moves.",
      basis: [
        { section_id: "s-4", pipeline_id: null },
        { section_id: "s-3", pipeline_id: "p-2" },
      ],
    },
  },
}

/** Your edit: a typed diameter, saved as the Edit window saves it. */
export const YourEdit: Story = {
  name: "Your edit",
  args: {
    title: "Set the diameter of Unnamed section",
    offer: {
      id: "offer-4",
      kind: "edit",
      section_ids: ["s-4"],
      attribute: "diameter",
      value: "16 in",
      left_out: [],
      basis: [{ section_id: "s-4", pipeline_id: null }],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Open in Edit" })
    ).toBeVisible()
  },
}
