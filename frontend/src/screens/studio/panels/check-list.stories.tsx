import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"
import { expect, fn } from "storybook/test"

import { controlled } from "@/test/controlled"

import { CheckList } from "./filter-controls"

/* A list of boxes, any number at once, each with its count. Invented counts. */

const meta = {
  title: "Studio/Filters/CheckList",
  component: CheckList,
  args: {
    label: "Proposed end",
    options: [
      { name: "end", count: 37 },
      { name: "cut", count: 46 },
    ],
    value: [],
    onChange: fn(),
    name: (kind: string) =>
      kind === "end" ? "The whole section" : "Part of it",
  },
  decorators: [
    // Controlled: what is ticked stays ticked.
    controlled<ComponentProps<typeof CheckList>>(
      "onChange",
      (_current, value: string[]) => ({ value })
    ),
  ],
} satisfies Meta<typeof CheckList>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing ticked: each option with how many it would leave. */
export const NoneTicked: Story = {
  name: "None ticked",
  play: async ({ canvas }) => {
    const part = canvas.getByText("Part of it").closest("label")!
    await expect(part).toHaveTextContent("Part of it46")
    for (const box of canvas.getAllByRole("checkbox")) {
      await expect(box).not.toBeChecked()
    }
  },
}

/** Reached by ticking one: the change is reported with its key. */
export const OneTicked: Story = {
  name: "One ticked",
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getAllByRole("checkbox")[1])
    await expect(args.onChange).toHaveBeenLastCalledWith(["cut"])
    await expect(canvas.getAllByRole("checkbox")[1]).toBeChecked()
  },
}
