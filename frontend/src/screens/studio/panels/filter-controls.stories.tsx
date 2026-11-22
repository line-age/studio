import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, screen } from "storybook/test"

import { CheckList, Group, Km, MultiPick } from "./filter-controls"

/*
 * The controls the Filters panel is built from, each in its states. Options
 * and counts are invented.
 */

/** What a story hands its control, as spies the play function checks. */
interface Args {
  onChange: (next: string[]) => void
  onClear: () => void
}

const meta = {
  title: "Studio/Filter controls",
  args: { onChange: fn(), onClear: fn() },
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

const EDITIONS = [
  { name: "ed-1929", count: 664 },
  { name: "ed-1931", count: 266 },
  { name: "ed-1937", count: 96 },
  { name: "ed-1947", count: 0 },
]
const editionLabel = (id: string) => `${id.slice(3)} edition`

/** A MultiPick that keeps what is picked, and reports each change. */
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
      placeholder="Type to find an edition"
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

export const MultiPickEmpty: Story = {
  render: (args) => <Editions onChange={args.onChange} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Search editions" })
    ).toHaveAttribute("placeholder", "Type to find an edition")
  },
}

export const MultiPickSeveralTicked: Story = {
  render: (args) => (
    <Editions initial={["ed-1929", "ed-1937"]} onChange={args.onChange} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("1929 edition")).toBeVisible()
    await expect(canvas.getByLabelText("1937 edition")).toBeVisible()
  },
}

/** Type to find an edition, tick two; each shows its count. */
export const MultiPickTypeAndTick: Story = {
  render: (args) => <Editions onChange={args.onChange} />,
  play: async ({ canvas, userEvent, args, step }) => {
    const box = canvas.getByRole("combobox", { name: "Search editions" })
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

export const MultiPickNoMatch: Story = {
  render: (args) => <Editions onChange={args.onChange} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Search editions" }),
      "1850"
    )
    await expect(await screen.findByText("Nothing matches.")).toBeVisible()
  },
}

/** A list of boxes, any number at once, each with its count. */
function Ends({ onChange }: { onChange: (next: string[]) => void }) {
  const [value, setValue] = useState<string[]>([])
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

export const CheckListTickOne: Story = {
  render: (args) => <Ends onChange={args.onChange} />,
  play: async ({ canvas, userEvent, args }) => {
    const part = canvas.getByText("Part of it").closest("label")!
    await expect(part).toHaveTextContent("Part of it46")
    await userEvent.click(canvas.getAllByRole("checkbox")[1])
    await expect(args.onChange).toHaveBeenLastCalledWith(["cut"])
    await expect(canvas.getAllByRole("checkbox")[1]).toBeChecked()
  },
}

/** Two ends of a range in km; marked when it runs backwards. */
function Length({ from, to }: { from: number | null; to: number | null }) {
  const [range, setRange] = useState({ from, to })
  const backwards =
    range.from !== null && range.to !== null && range.from > range.to
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Km
          label="Length from, km"
          placeholder="0"
          value={range.from}
          onChange={(km) => setRange((r) => ({ ...r, from: km }))}
          invalid={backwards}
          describedBy={backwards ? "km-backwards" : undefined}
        />
        <span className="type-ui-sm text-muted-foreground">to</span>
        <Km
          label="Length to, km"
          placeholder="1652"
          value={range.to}
          onChange={(km) => setRange((r) => ({ ...r, to: km }))}
          invalid={backwards}
          describedBy={backwards ? "km-backwards" : undefined}
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

export const KmEmpty: Story = { render: () => <Length from={null} to={null} /> }

export const KmFilled: Story = { render: () => <Length from={5} to={50} /> }

/** Typing a from beyond the to marks both boxes and says why. */
export const KmBackwards: Story = {
  render: () => <Length from={null} to={5} />,
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

export const GroupOff: Story = {
  render: (args) => (
    <Group title="Length" on={false} onClear={args.onClear}>
      <Length from={null} to={null} />
    </Group>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Clear Length" })
    ).toBeNull()
  },
}

/** A group that is on offers Clear. */
export const GroupOnClear: Story = {
  render: (args) => (
    <Group title="Length" on onClear={args.onClear}>
      <Length from={5} to={50} />
    </Group>
  ),
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Clear Length" }))
    await expect(args.onClear).toHaveBeenCalledOnce()
  },
}
