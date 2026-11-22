import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { Group, LengthRange } from "./filter-controls"

/* One filter's group in the Filters panel: its title, and Clear while on. */

const noop = () => {}

const meta = {
  title: "Studio/Filters/Group",
  component: Group,
  args: { title: "Length", on: false, onClear: fn(), children: null },
  render: (args) => (
    <Group {...args}>
      <LengthRange
        from={args.on ? 5 : null}
        to={args.on ? 50 : null}
        bounds={[0, 1652]}
        onChange={noop}
      />
    </Group>
  ),
} satisfies Meta<typeof Group>

export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Clear Length" })
    ).toBeNull()
  },
}

/** On, it offers Clear. */
export const On: Story = {
  args: { on: true },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Clear Length" }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  },
}
