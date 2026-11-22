import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { MapPickLabel } from "./map-pick-label"

/** Beside the pointer while picking (Figma `482:19090`). */
const meta = {
  title: "Studio/Map/MapPickLabel",
  component: MapPickLabel,
  args: {
    section: "U-a · Calder Jct to Dunmore",
    where: "In no pipeline",
    click: "click to add",
    x: 0,
    y: 0,
  },
  decorators: [
    (Story) => (
      <div className="relative h-24 w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MapPickLabel>

export default meta
type Story = StoryObj<typeof meta>

/** A section in no pipeline: a click adds it. */
export const InNoPipeline: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(
      "In no pipeline · click to add"
    )
  },
}

/** One of the pipeline's own: a click marks it for removal. */
export const Member: Story = {
  args: { where: "In Calder Valley", click: "click to remove" },
}

/** Already picked: a second click undoes it. */
export const Picked: Story = {
  args: { where: "Picked", click: "click to undo" },
}
