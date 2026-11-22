import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, screen, waitFor } from "storybook/test"

import type { Session } from "@/data/session"
import { SessionContext } from "@/data/session-context"

import { AccountMenu } from "./account-menu"

/** The top bar's right end with someone using Studio. */
const as = (session: Session) => [
  (Story: () => React.ReactNode) => (
    <SessionContext value={session}>
      <div className="flex w-max items-center bg-topbar p-1.5">
        <Story />
      </div>
    </SessionContext>
  ),
]

/** Who is using Studio, and Sign out (Figma section 19, `459:16690`). */
const meta = {
  title: "Studio/TopBar/AccountMenu",
  component: AccountMenu,
  args: { onSignOut: fn() },
} satisfies Meta<typeof AccountMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Signed in, the menu open: the name, the GitHub login, Sign out. */
export const SignedIn: Story = {
  name: "Signed in",
  decorators: as({
    kind: "signed-in",
    name: "Ada Example",
    login: "ada-example",
    chat: "c",
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Account/ }))
    // The menu fades in.
    await waitFor(() => expect(screen.getByText("@ada-example")).toBeVisible())
    await expect(
      screen.getByRole("menuitem", { name: "Sign out" })
    ).toBeVisible()
  },
}

/** Local developer, the menu open: nothing to sign out of. */
export const LocalDeveloper: Story = {
  name: "Local developer",
  decorators: as({ kind: "local" }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Account/ }))
    await waitFor(() =>
      expect(screen.getByText("No sign-in on this machine")).toBeVisible()
    )
  },
}
