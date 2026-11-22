import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { Checkbox } from "@/components/ui/checkbox"

import { OptionRow } from "./filter-controls"

/* One choice in a filter group, with how many sections it would leave. */

const meta = {
  title: "Studio/Filters/OptionRow",
  component: OptionRow,
  args: {
    control: <Checkbox />,
    label: "Needs your decision",
    count: 1234,
    selected: false,
  },
} satisfies Meta<typeof OptionRow>

export default meta
type Story = StoryObj<typeof meta>

/** Not chosen: the label in the regular weight, the count grouped. */
export const NotChosen: Story = {
  name: "Not chosen",
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("checkbox", { name: /Needs your decision/ })
    ).not.toBeChecked()
    await expect(canvas.getByText("1,234")).toBeVisible()
  },
}

/** Chosen: the label turns medium, so the rows that are on stand out. */
export const Chosen: Story = {
  args: { control: <Checkbox checked />, selected: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("checkbox", { name: /Needs your decision/ })
    ).toBeChecked()
  },
}

/** A choice no section has still shows, with 0, so the list never jumps. */
export const NoneLeft: Story = {
  name: "None left",
  args: { count: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("0")).toBeVisible()
  },
}
