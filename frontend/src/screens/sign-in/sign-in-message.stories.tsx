import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { SignInMessage } from "./sign-in-message"

/** A boxed message on the sign-in card (Figma section 19, `425:15687`). */
const meta = {
  title: "Sign in/SignInMessage",
  component: SignInMessage,
  args: { tone: "muted", children: "Signed in as ada-example." },
} satisfies Meta<typeof SignInMessage>

export default meta
type Story = StoryObj<typeof meta>

/** What is so: the account that was used. */
export const Muted: Story = {}

/** What failed, announced to a screen reader. */
export const Failed: Story = {
  args: {
    tone: "failed",
    children: "Could not sign in: GitHub did not answer. Nothing was changed.",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Could not sign in"
    )
  },
}
