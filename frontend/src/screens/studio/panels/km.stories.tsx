import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect } from "storybook/test"

import { Km } from "./filter-controls"

/*
 * One end of a range in whole km. Shown as the Filters panel uses it: two,
 * from and to, marked when the range runs backwards.
 */

interface Args {
  from: number | null
  to: number | null
}

function Length({ from, to }: Args) {
  const [range, setRange] = useState({ from, to })
  const backwards =
    range.from !== null && range.to !== null && range.from > range.to
  const describedBy = backwards ? "km-backwards" : undefined
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Km
          label="Length from, km"
          name="length-from"
          placeholder="0"
          value={range.from}
          onChange={(km) => setRange((r) => ({ ...r, from: km }))}
          invalid={backwards}
          describedBy={describedBy}
        />
        <span className="type-ui-sm text-muted-foreground">to</span>
        <Km
          label="Length to, km"
          name="length-to"
          placeholder="1652"
          value={range.to}
          onChange={(km) => setRange((r) => ({ ...r, to: km }))}
          invalid={backwards}
          describedBy={describedBy}
        />
      </div>
      {backwards && (
        <p id="km-backwards" className="type-ui-sm text-muted-foreground">
          From is more than to, so no section can match.
        </p>
      )}
    </div>
  )
}

const meta = {
  title: "Studio/Filters/Km",
  args: { from: null, to: null },
  render: (args) => <Length from={args.from} to={args.to} />,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

export const Empty: Story = {}

export const Filled: Story = { args: { from: 5, to: 50 } }

/** Reached by typing a from beyond the to: both boxes marked, and why. */
export const Backwards: Story = {
  args: { to: 5 },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("spinbutton", { name: "Length from, km" }),
      "50"
    )
    for (const name of ["Length from, km", "Length to, km"]) {
      const box = canvas.getByRole("spinbutton", { name })
      await expect(box).toHaveAttribute("aria-invalid", "true")
      await expect(box).toHaveAccessibleDescription(
        "From is more than to, so no section can match."
      )
    }
  },
}
