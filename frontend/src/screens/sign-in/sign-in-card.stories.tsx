import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "@/components/ui/button"

import { SignInCard } from "./sign-in-card"
import { SignInMessage } from "./sign-in-message"

/** The card every sign-in state is drawn in (Figma section 19, `425:15687`). */
const meta = {
  title: "Sign in/SignInCard",
  component: SignInCard,
  args: {
    heading: "Sign in to Lineage Studio",
    children: <Button size="lg">Sign in with GitHub</Button>,
  },
  // The card is wider than the left panel the stories sit in.
  decorators: [
    (Story) => (
      <div className="w-max">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignInCard>

export default meta
type Story = StoryObj<typeof meta>

/** On the sign-in page: a heading, a line, the button. */
export const OnThePage: Story = {
  name: "On the page",
  args: {
    description:
      "Studio uses your GitHub account. You need to be in one of the project's GitHub teams.",
  },
}

/** With a message: a sign-in that failed. */
export const WithAMessage: Story = {
  name: "With a message",
  args: {
    children: (
      <>
        <SignInMessage tone="failed">
          Could not sign in: GitHub did not answer. Nothing was changed.
        </SignInMessage>
        <Button size="lg">Try again</Button>
      </>
    ),
  },
}

/** Over the open screen ("Sign in again"): bordered, with a shadow. */
export const OverTheScreen: Story = {
  name: "Over the screen",
  args: {
    heading: "Sign in again",
    description: "Your sign-in ended. What is on the screen stays as it is.",
    className: "border border-border bg-card shadow-panel",
    children: <Button size="lg">Sign in with GitHub</Button>,
  },
}
