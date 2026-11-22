import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { ModalSectionRow } from "./modal-section-row"

/** One section in the Sections modal's list (Figma `469:17275`). */
const meta = {
  title: "Studio/Editing/ModalSectionRow",
  component: ModalSectionRow,
  args: {
    code: "S-0140",
    name: "Marsh Fork to Calder Jct",
    state: "0/2 cited",
    action: "Remove",
    onAction: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="w-[528px] rounded-md border">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ModalSectionRow>

export default meta
type Story = StoryObj<typeof meta>

/** In the pipeline: how much is cited, and Remove. */
export const Member: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Remove S-0140 Marsh Fork to Calder Jct",
      })
    )
    await expect(args.onAction).toHaveBeenCalledOnce()
  },
}

/** Found or picked: New, where it comes from, and Undo. */
export const Added: Story = {
  args: {
    code: "S-0152",
    name: "Calder Jct to Dunmore",
    state: "New · leaves Tolland",
    tone: "added",
    action: "Undo",
  },
}

/** Marked for removal: struck through and faint, never dashed, with Undo. */
export const Removed: Story = {
  args: { state: "Will be removed", tone: "removed", action: "Undo" },
}

/** A section with no name goes by its code. */
export const NoName: Story = { args: { name: null } }
