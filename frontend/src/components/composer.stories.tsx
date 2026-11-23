import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, waitFor } from "storybook/test"

import { Composer } from "./composer"

/**
 * The Agent's message box (Figma Composer `81:463`; the empty chat's examples,
 * section 28 board E `537:23933`). All words are invented.
 */
const meta = {
  title: "Parts/Composer",
  component: Composer,
  decorators: [
    (Story) => (
      <div className="w-104">
        <Story />
      </div>
    ),
  ],
  args: {
    placeholder: "Ask about anything on screen. Type # to add it.",
    onSend: fn(),
    onAttach: fn(),
  },
} satisfies Meta<typeof Composer>

export default meta
type Story = StoryObj<typeof meta>

/** Empty, with nothing to suggest: the plain placeholder. */
export const Empty: Story = {}

/** The empty chat writes examples; Tab takes the one showing, as the person's words. */
export const Examples: Story = {
  args: { examples: ["Make these one pipeline", "Which maps show them?"] },
  play: async ({ canvas, userEvent, step }) => {
    const box = canvas.getByRole("textbox", { name: "Message to the Agent" })
    await step("A screen reader hears the plain placeholder", async () => {
      await expect(box).toHaveAttribute(
        "aria-placeholder",
        "Ask about anything on screen. Type # to add it."
      )
    })
    await step("Tab takes the example", async () => {
      await expect(await canvas.findByText(/to use this example/)).toBeVisible()
      await userEvent.click(box)
      await userEvent.keyboard("{Tab}")
      await expect(box).toHaveValue("Make these one pipeline")
      await expect(canvas.queryByText(/to use this example/)).toBeNull()
    })
  },
}

/** Typing anything stops the examples for good, even once the box is empty again. */
export const TypingStops: Story = {
  name: "Typing stops them",
  args: { examples: ["Make these one pipeline"] },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole("textbox", { name: "Message to the Agent" })
    await canvas.findByText(/to use this example/)
    await userEvent.type(box, "W")
    await userEvent.clear(box)
    await waitFor(() =>
      expect(canvas.queryByText(/to use this example/)).toBeNull()
    )
    await expect(box).toHaveAttribute(
      "placeholder",
      "Ask about anything on screen. Type # to add it."
    )
  },
}

/** A message sends on Enter. */
export const Sends: Story = {
  play: async ({ canvas, userEvent, args }) => {
    const box = canvas.getByRole("textbox", { name: "Message to the Agent" })
    await userEvent.type(box, "Who owned it?{Enter}")
    await expect(args.onSend).toHaveBeenCalledWith("Who owned it?")
    await expect(box).toHaveValue("")
  },
}

/** While the Agent works, send is Stop. */
export const Working: Story = {
  args: { onStop: fn() },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }))
    await expect(args.onStop).toHaveBeenCalled()
  },
}
