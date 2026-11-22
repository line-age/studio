import type { Meta, StoryObj } from "@storybook/react-vite"

import { PersonAvatar } from "./person-avatar"

/** Who is using Studio, as initials in a circle (Figma `Avatar`, `463:17223`). */
const meta = {
  title: "Parts/PersonAvatar",
  component: PersonAvatar,
  args: { name: "Ada Example", kind: "person" },
} satisfies Meta<typeof PersonAvatar>

export default meta
type Story = StoryObj<typeof meta>

/** Someone signed in with GitHub, at the top bar's size. */
export const Person: Story = { args: { size: "sm" } }

/** The same person in the account menu. */
export const PersonInTheMenu: Story = {
  name: "Person, in the menu",
  args: { size: "default" },
}

/** Local developer: grey, so it never reads as an account. */
export const Local: Story = {
  args: { name: "Local developer", kind: "local", size: "sm" },
}

/** A GitHub name of one word gives one letter. */
export const OneWord: Story = {
  name: "One word",
  args: { name: "ada", size: "default" },
}
