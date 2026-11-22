import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { useCamera } from "../studio-store"
import { CameraStatus } from "./camera-status"

/* The foot of the list: where the map is. It reads the map's camera. */

const meta = {
  title: "Studio/List/CameraStatus",
  component: CameraStatus,
  beforeEach: () => {
    useCamera.setState({ zoom: null, center: null })
  },
} satisfies Meta<typeof CameraStatus>

export default meta
type Story = StoryObj<typeof meta>

/** Before the map has started (or without a token): the bar stays empty. */
export const NoMap: Story = {
  name: "No map yet",
  play: async ({ canvasElement }) => {
    await expect(canvasElement).not.toHaveTextContent(/Zoom|Centre/)
  },
}

/** The map's zoom, and the latitude and longitude at its centre. */
export const OnTheMap: Story = {
  name: "On the map",
  // The centre is muted-foreground on the status bar: 3.68:1, under the 4.5
  // text needs. A token question for Figma (muted-foreground on any grey);
  // reported in the a11y panel, not failed, until the owner decides it.
  parameters: { a11y: { test: "todo" } },
  beforeEach: () => {
    useCamera.getState().setCamera(4.5, [-95.71234, 37.09024])
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Zoom 4.50")).toBeVisible()
    await expect(canvas.getByText("Centre 37.090, -95.712")).toBeVisible()
  },
}
