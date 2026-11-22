import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn } from "storybook/test"

import { CheckList } from "./filter-controls"

/* A list of boxes, any number at once, each with its count. Invented counts. */

/** Keeps what is ticked, and reports each change. */
function Ends({
  initial,
  onChange,
}: {
  initial: string[]
  onChange: (next: string[]) => void
}) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <CheckList
      label="Proposed end"
      options={[
        { name: "end", count: 37 },
        { name: "cut", count: 46 },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      name={(kind) => (kind === "end" ? "The whole section" : "Part of it")}
    />
  )
}

interface Args {
  initial: string[]
  onChange: (next: string[]) => void
}

const meta = {
  title: "Studio/Filters/CheckList",
  args: { initial: [], onChange: fn() },
  render: (args) => <Ends initial={args.initial} onChange={args.onChange} />,
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

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

/** Reached by ticking one. */
export const OneTicked: Story = {
  name: "One ticked",
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getAllByRole("checkbox")[1])
    await expect(args.onChange).toHaveBeenLastCalledWith(["cut"])
    await expect(canvas.getAllByRole("checkbox")[1]).toBeChecked()
  },
}
