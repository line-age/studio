import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, screen } from "storybook/test"

import { MultiPick } from "./filter-controls"

/*
 * A search with a dropdown, several tickable, each with its count (First
 * shown by, Traced by). Editions and counts are invented.
 */

const EDITIONS = [
  { name: "ed-1929", count: 664 },
  { name: "ed-1931", count: 266 },
  { name: "ed-1937", count: 96 },
  { name: "ed-1947", count: 0 },
]
const editionLabel = (id: string) => `${id.slice(3)} edition`

/** Keeps what is picked, and reports each change. */
function Editions({
  initial = [],
  onChange,
}: {
  initial?: string[]
  onChange: (next: string[]) => void
}) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <MultiPick
      noun="editions"
      placeholder="Type to find an edition…"
      options={EDITIONS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      name={editionLabel}
    />
  )
}

interface Args {
  initial: string[]
  onChange: (next: string[]) => void
}

const meta = {
  title: "Studio/Filters/MultiPick",
  args: { initial: [], onChange: fn() },
  render: (args) => (
    <Editions initial={args.initial} onChange={args.onChange} />
  ),
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

const searchBox = (canvas: {
  getByRole: (role: "combobox", o: { name: string }) => HTMLElement
}) => canvas.getByRole("combobox", { name: "Search editions" })

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(searchBox(canvas)).toHaveAttribute(
      "placeholder",
      "Type to find an edition…"
    )
  },
}

export const SeveralTicked: Story = {
  name: "Several ticked",
  args: { initial: ["ed-1929", "ed-1937"] },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("1929 edition")).toBeVisible()
    await expect(canvas.getByLabelText("1937 edition")).toBeVisible()
  },
}

/** Reached by typing to find an edition and ticking two. */
export const Open: Story = {
  name: "Open, two ticked",
  play: async ({ canvas, userEvent, args, step }) => {
    const box = searchBox(canvas)
    await step("Type to find one", async () => {
      await userEvent.type(box, "1931")
      // The dropdown opens outside the story's own frame.
      const option = await screen.findByRole("option", { name: /1931 edition/ })
      await expect(option).toHaveTextContent("266")
      await userEvent.click(option)
      await expect(args.onChange).toHaveBeenLastCalledWith(["ed-1931"])
    })
    await step("Tick a second", async () => {
      await userEvent.clear(box)
      await userEvent.type(box, "1929")
      await userEvent.click(
        await screen.findByRole("option", { name: /1929 edition/ })
      )
      await expect(args.onChange).toHaveBeenLastCalledWith([
        "ed-1931",
        "ed-1929",
      ])
    })
  },
}

/** Reached by keyboard alone: type, Enter picks the first match. */
export const PickedByKeyboard: Story = {
  name: "Picked by keyboard",
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(searchBox(canvas))
    await userEvent.keyboard("1937")
    await screen.findByRole("option", { name: /1937 edition/ })
    await userEvent.keyboard("{Enter}")
    await expect(args.onChange).toHaveBeenLastCalledWith(["ed-1937"])
    await expect(canvas.getByLabelText("1937 edition")).toBeVisible()
  },
}

export const NoMatch: Story = {
  name: "No match",
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(searchBox(canvas), "1850")
    await expect(await screen.findByText("Nothing matches.")).toBeVisible()
  },
}
