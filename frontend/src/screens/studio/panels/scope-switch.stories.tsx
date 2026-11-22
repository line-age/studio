import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import type { Scope } from "@/data/derive"

import { useStudio } from "../studio-store"
import { ScopeSwitch } from "./scope-switch"

/** The switch with one scope on, set before the story renders. */
const on = (scope: Scope) => () => {
  useStudio.setState(useStudio.getInitialState(), true)
  useStudio.getState().setScope(scope)
}

const meta = {
  title: "Studio/List/ScopeSwitch",
  component: ScopeSwitch,
  beforeEach: on("all"),
} satisfies Meta<typeof ScopeSwitch>

export default meta
type Story = StoryObj<typeof meta>

const pressed = (canvas: { getAllByRole: (r: "button") => HTMLElement[] }) =>
  canvas
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent)

/** Studio opens on All. */
export const All: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("group", { name: "Show" })).toBeVisible()
    await expect(pressed(canvas)).toEqual(["All"])
  },
}

export const Pipelines: Story = { beforeEach: on("pipelines") }

export const Unplaced: Story = { beforeEach: on("unplaced") }

/** Pressing a choice moves the switch; pressing it again leaves it on. */
export const PipelinesPicked: Story = {
  name: "Pipelines, picked",
  play: async ({ canvas, userEvent, step }) => {
    await step("Press Pipelines", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Pipelines" }))
      await expect(pressed(canvas)).toEqual(["Pipelines"])
      await expect(useStudio.getState().scope).toBe("pipelines")
    })
    await step("Press it again: one is always on", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Pipelines" }))
      await expect(pressed(canvas)).toEqual(["Pipelines"])
    })
  },
}

/** Reached by keyboard: Tab to the switch, the arrows move, Enter presses. */
export const PickedByKeyboard: Story = {
  name: "Unplaced, picked by keyboard",
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "All" })).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}")
    await expect(pressed(canvas)).toEqual(["Unplaced"])
  },
}
