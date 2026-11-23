import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { SourceCard } from "./source-card"

/** One source of a claim in the sources pop-up (Figma `SourceCard`, `488:19870`). */
const meta = {
  title: "Parts/SourceCard",
  component: SourceCard,
  decorators: [
    (Story) => (
      <ul className="w-112">
        <Story />
      </ul>
    ),
  ],
  args: {
    kind: "Journal",
    title: "Example Gazette, vol. 32 no. 3",
    where: "States · p. 41",
    quote:
      "“The company's 20-inch line from Sample City to Example Junction was placed in service this month.”",
    href: "https://example.org/gazette/32/3/41",
  },
} satisfies Meta<typeof SourceCard>

export default meta
type Story = StoryObj<typeof meta>

/** A journal page with the words it says and a link to it. */
export const Quoted: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "Open source" })
    ).toHaveAttribute("href", "https://example.org/gazette/32/3/41")
  },
}

/** A scanned map: no words to quote, no address, a note says why. */
export const ScannedMap: Story = {
  name: "Scanned map",
  args: {
    kind: "Map",
    title: "Example Trunk Lines map",
    where: "Shown on · 1947 edition, as of 1 January 1947",
    quote: undefined,
    href: undefined,
    note: "No quote, scanned map",
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link")).toBeNull()
    await expect(canvas.getByText("No quote, scanned map")).toBeVisible()
  },
}

/** A title long enough to wrap. */
export const LongTitle: Story = {
  name: "Long title",
  args: {
    title:
      "Supplement to the Example Gazette, issue of the twentieth of September, with the trunk lines of the whole region",
  },
}
