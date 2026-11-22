import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { Group, Km } from "./filter-controls"

/* One filter's group in the Filters panel: its title, and Clear while on. */

const noop = () => {}

const meta = {
  title: "Studio/Filters/Group",
  component: Group,
  args: { title: "Length", on: false, onClear: fn(), children: null },
  render: (args) => (
    <Group {...args}>
      <div className="flex items-center gap-2">
        <Km
          label="Length from, km"
          name="length-from"
          placeholder="0"
          value={args.on ? 5 : null}
          onChange={noop}
        />
        <span className="type-ui-sm text-muted-foreground">to</span>
        <Km
          label="Length to, km"
          name="length-to"
          placeholder="1652"
          value={args.on ? 50 : null}
          onChange={noop}
        />
      </div>
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
