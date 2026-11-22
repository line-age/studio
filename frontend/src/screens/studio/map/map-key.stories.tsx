import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import { controlled } from "@/test/controlled"

import { DEFAULT_LINE_STYLE } from "../settings"
import type { LayerId } from "../studio-store"
import { MapKeyPopover } from "./map-key"

/* The map key: how each line is drawn and what it means (Figma `239:10993`). */

const meta = {
  title: "Studio/Map/MapKey",
  component: MapKeyPopover,
  args: {
    lineStyle: DEFAULT_LINE_STYLE,
    waiting: 3,
    layers: { proposed: true, faint: false },
    onToggleLayer: fn(),
    onOpenSettings: fn(),
  },
  decorators: [
    // Controlled: an eye pressed stays pressed.
    controlled<ComponentProps<typeof MapKeyPopover>>(
      "onToggleLayer",
      (current, layer: LayerId) => ({
        layers: { ...current.layers, [layer]: !current.layers[layer] },
      })
    ),
    // It sits at the map's right edge and opens to the left.
    (Story) => (
      <div className="flex min-h-96 justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MapKeyPopover>

export default meta
type Story = StoryObj<typeof meta>

/** Closed: one button among the map controls. */
export const Closed: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Map key" })).toBeVisible()
  },
}

/** Open: every kind of line, with what it means. */
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Map key" }))
    const key = await screen.findByRole("dialog", { name: "Map key" })
    for (const row of ["Heavy", "Thin", "Dashed", "Faint", "Blue"]) {
      await expect(key).toHaveTextContent(row)
    }
    await expect(key).toHaveTextContent("In a pipeline")
    await expect(key).toHaveTextContent("3 waiting")
  },
}

/** Reached by pressing an eye: Faint is drawn; the map is told. */
export const FaintShown: Story = {
  name: "Faint shown",
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Map key" }))
    const eye = await screen.findByRole("button", {
      name: "Show sections hidden by the filters on the map",
    })
    await expect(eye).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(eye)
    await expect(args.onToggleLayer).toHaveBeenCalledWith("faint")
    await expect(eye).toHaveAttribute("aria-pressed", "true")
  },
}

/** "Change how lines are drawn" closes the key and asks for Settings. */
export const ToSettings: Story = {
  name: "To Settings",
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Map key" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "Change how lines are drawn" })
    )
    await expect(args.onOpenSettings).toHaveBeenCalledOnce()
    // It closes after its fade.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Map key" })).toBeNull()
    )
  },
}
