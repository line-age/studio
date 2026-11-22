import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { PickBar } from "./pick-bar"

/** Pick on the map (Figma `475:17477`): the Sections modal folded into a bar. */
const meta = {
  title: "Studio/Map/PickBar",
  component: PickBar,
  args: { pipeline: "Calder Valley", picked: 0, onCancel: fn(), onDone: fn() },
  decorators: [
    (Story) => (
      <div className="relative h-20 w-[760px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PickBar>

export default meta
type Story = StoryObj<typeof meta>

/** Just opened: it says what a click does to either kind of section. */
export const NothingPicked: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "0 picked · click a section to add it, or one of Calder Valley's to remove it"
    )
  },
}

/** Two picked: Done goes back to the modal with them listed. */
export const TwoPicked: Story = {
  args: { picked: 2 },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Done" }))
    await expect(args.onDone).toHaveBeenCalledOnce()
  },
}

/** Cancel drops only the picks. */
export const Cancelled: Story = {
  args: { picked: 1 },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }))
    await expect(args.onCancel).toHaveBeenCalledOnce()
  },
}
