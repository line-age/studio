import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { FilterChips } from "./filter-chips"

/** The chips under the search: the filters in force, each with its remove. */
const meta = {
  title: "Studio/List/FilterChips",
  component: FilterChips,
} satisfies Meta<typeof FilterChips>

export default meta
type Story = StoryObj<typeof meta>

const chip = (label: string, hint: string) => ({ label, hint, remove: fn() })

/** Nothing on: nothing drawn. */
export const None: Story = {
  args: { chips: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[role=group]")).toBeNull()
  },
}

/** One filter: its chip, and no Clear all. */
export const One: Story = {
  args: {
    chips: [
      chip(
        "First shown by the 1931 edition",
        "Only sections first shown by the 1931 edition."
      ),
    ],
  },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.queryByRole("button", { name: "Clear all" })).toBeNull()
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Remove the filter: First shown by the 1931 edition",
      })
    )
    await expect(args.chips[0].remove).toHaveBeenCalledOnce()
  },
}

/** Several: Clear all takes every one off. */
export const Many: Story = {
  args: {
    chips: [
      chip("Not started", "Only sections that are not started."),
      chip("5 to 50 km", "Only sections whose line is this long."),
      chip(
        "Proposed end: part of it",
        "Only sections a tool proposes an end for."
      ),
    ],
  },
  play: async ({ canvas, userEvent, args }) => {
    await expect(
      canvas.getByRole("group", { name: "Filters in force" })
    ).toHaveTextContent("5 to 50 km")
    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }))
    for (const c of args.chips) await expect(c.remove).toHaveBeenCalledOnce()
  },
}
