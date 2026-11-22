import type { Meta, StoryObj } from "@storybook/react-vite"

import { AccountButton } from "./account-button"

/** Who is signed in, at the right end of the dark top bar (Figma `AccountButton`, `463:17264`). */
const meta = {
  title: "Studio/TopBar/AccountButton",
  component: AccountButton,
  args: { name: "Ada Example", kind: "person" },
  // It only ever sits on the top bar.
  decorators: [
    (Story) => (
      <div className="w-max bg-topbar p-1.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccountButton>

export default meta
type Story = StoryObj<typeof meta>

/** Someone signed in with GitHub. */
export const Person: Story = {}

/** Local developer, where there is no sign-in. */
export const Local: Story = {
  args: { name: "Local developer", kind: "local" },
}

/** A long name is cut short, not the bar. */
export const LongName: Story = {
  name: "Long name",
  args: { name: "Ada Example of the Calder Valley Historical Pipelines Group" },
}
