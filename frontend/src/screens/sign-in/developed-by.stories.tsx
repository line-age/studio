import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { DevelopedBy, TIGHT_LINE_URL } from "./developed-by"

/** The Tight Line credit on the sign-in page (Figma `DevelopedBy`, `465:17257`). */
const meta = {
  title: "Sign in/DevelopedBy",
  component: DevelopedBy,
  args: { surface: "dark" },
} satisfies Meta<typeof DevelopedBy>

export default meta
type Story = StoryObj<typeof meta>

/** At the bottom of the editions panel; the logo leads to Tight Line's site. */
export const Dark: Story = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: /Tight Line/ })
    await expect(link).toHaveAttribute("href", TIGHT_LINE_URL)
    await expect(link).toHaveAttribute("target", "_blank")
  },
  decorators: [
    (Story) => (
      <div className="w-max bg-topbar p-3">
        <Story />
      </div>
    ),
  ],
}

/** On white, where the panel is hidden on a narrow screen. */
export const Light: Story = { args: { surface: "light" } }
