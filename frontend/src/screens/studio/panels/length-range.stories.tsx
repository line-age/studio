import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"
import { expect, fn } from "storybook/test"

import { controlled } from "@/test/controlled"

import { LengthRange } from "./filter-controls"

/* How long a section is, from and to, in km. Invented bounds. */

const meta = {
  title: "Studio/Filters/LengthRange",
  component: LengthRange,
  args: { from: null, to: null, bounds: [0, 1652], onChange: fn() },
  decorators: [
    // Controlled: what is typed stays.
    controlled<ComponentProps<typeof LengthRange>>(
      "onChange",
      (_current, from: number | null, to: number | null) => ({
        from,
        to,
      })
    ),
  ],
} satisfies Meta<typeof LengthRange>

export default meta
type Story = StoryObj<typeof meta>

const box = (
  canvas: { getByRole: (r: "spinbutton", o: { name: string }) => HTMLElement },
  end: "from" | "to"
) => canvas.getByRole("spinbutton", { name: `Length ${end}, km` })

/** Empty: the shortest and longest section show as placeholders. */
export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(box(canvas, "from")).toHaveAttribute("placeholder", "0")
    await expect(box(canvas, "to")).toHaveAttribute("placeholder", "1652")
  },
}

/** A range in force: both ends typed. */
export const Filled: Story = { args: { from: 5, to: 50 } }

/** Reached by typing a from beyond the to: both boxes marked, and why. */
export const Backwards: Story = {
  args: { to: 5 },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.type(box(canvas, "from"), "50")
    await expect(args.onChange).toHaveBeenLastCalledWith(50, 5)
    for (const end of ["from", "to"] as const) {
      await expect(box(canvas, end)).toHaveAttribute("aria-invalid", "true")
      await expect(box(canvas, end)).toHaveAccessibleDescription(
        "From is more than to, so no section can match."
      )
    }
  },
}
