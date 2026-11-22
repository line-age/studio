import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn } from "storybook/test"

import { LengthRange } from "./filter-controls"

/* How long a section is, from and to, in km. Invented bounds. */

interface Args {
  from: number | null
  to: number | null
  bounds: readonly [number, number] | null
  onChange: (from: number | null, to: number | null) => void
}

/** Keeps the range typed, and reports each change. */
function Typed({ from, to, bounds, onChange }: Args) {
  const [range, setRange] = useState({ from, to })
  return (
    <LengthRange
      from={range.from}
      to={range.to}
      bounds={bounds}
      onChange={(nextFrom, nextTo) => {
        setRange({ from: nextFrom, to: nextTo })
        onChange(nextFrom, nextTo)
      }}
    />
  )
}

const meta = {
  title: "Studio/Filters/LengthRange",
  component: LengthRange,
  args: { from: null, to: null, bounds: [0, 1652], onChange: fn() },
  render: (args) => <Typed {...args} />,
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
