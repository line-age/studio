import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { LayerRow } from "./layer-row"
import { LINE_WEIGHT, LineKey, type LineKind } from "./line-key"

/** A line drawn the way the map draws it (Figma `LineKey`, `80:422`). */
const meta = {
  title: "Parts/LineKey",
  component: LineKey,
  args: { kind: "solid" },
} satisfies Meta<typeof LineKey>

export default meta
type Story = StoryObj<typeof meta>

const KINDS: LineKind[] = [
  "solid",
  "dotted",
  "dashed",
  "ghost",
  "selected",
  "heavy",
  "thin",
]

/** Every kind, side by side with its name. */
export const EveryKind: Story = {
  render: () => (
    <ul className="flex flex-col gap-2">
      {KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-3 type-ui-sm">
          <LineKey kind={kind} />
          {kind}
        </li>
      ))}
    </ul>
  ),
}

/** The two rows the map key gained: heavy in a pipeline, thin in none. */
export const HeavyAndThinRows: Story = {
  render: () => (
    <ul className="flex flex-col gap-0.5">
      <LayerRow
        name="Heavy"
        meta="In a pipeline"
        lineKey={<LineKey kind="heavy" />}
      />
      <LayerRow
        name="Thin"
        meta="Not in a pipeline"
        lineKey={<LineKey kind="thin" />}
      />
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const widths = [...canvasElement.querySelectorAll("path")].map((p) =>
      p.getAttribute("stroke-width")
    )
    await expect(widths).toEqual([
      String(LINE_WEIGHT.placed),
      String(LINE_WEIGHT.unplaced),
    ])
  },
}
