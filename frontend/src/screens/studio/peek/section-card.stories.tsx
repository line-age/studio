import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { SectionCard } from "./section-card"

/**
 * The hover card of a section (Figma section 27, `524:23541`): shown on
 * pointing at its line on the map or at its row in the right panel.
 */
const meta = {
  title: "Studio/Peek/SectionCard",
  component: SectionCard,
  args: {
    title: "Marsh Fork to Harlow",
    code: "S-0141",
    pipeline: "Calder Valley · P-012",
    facts: [
      { label: "Owner", value: "Calder Gas Co." },
      { label: "Diameter", value: "16 in" },
      { label: "First seen", value: "1931 edition" },
      { label: "Last seen", value: "1950 edition" },
      { label: "Length", value: "68 km" },
    ],
    proposals: 0,
  },
} satisfies Meta<typeof SectionCard>

export default meta
type Story = StoryObj<typeof meta>

/** Every fact cited, in a pipeline. */
export const Cited: Story = {
  play: async ({ canvas }) => {
    const card = canvas.getByRole("tooltip")
    await expect(card).toHaveTextContent("Marsh Fork to Harlow")
    await expect(card).toHaveTextContent("S-0141")
    await expect(card).not.toHaveTextContent("Unknown")
    await expect(card).not.toHaveTextContent("waiting")
  },
}

/**
 * No source names the section and it is in no pipeline: it goes by its
 * code, and each Unknown keeps its one mark.
 */
export const UnknownInNoPipeline: Story = {
  args: {
    title: "S-0149",
    code: null,
    pipeline: "In no pipeline",
    facts: [
      { label: "Name", value: null },
      { label: "Owner", value: null },
      { label: "Diameter", value: null },
      { label: "First seen", value: "1947 edition" },
      { label: "Last seen", value: "1947 edition" },
      { label: "Length", value: "8.4 km" },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Unknown")).toHaveLength(3)
    await expect(canvas.getByRole("tooltip")).toHaveTextContent(
      "In no pipeline"
    )
  },
}

/** A proposal waits: the card says so, and the value stays Unknown. */
export const ProposalWaiting: Story = {
  args: {
    title: "Harlow to Brecken",
    code: "S-0142",
    facts: [
      { label: "Owner", value: "Calder Gas Co." },
      { label: "Diameter", value: null },
      { label: "First seen", value: "1937 edition" },
      { label: "Last seen", value: "1950 edition" },
      { label: "Length", value: "41 km" },
    ],
    proposals: 1,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1 proposal waiting")).toBeVisible()
  },
}

/** Several proposals are counted in words. */
export const SeveralProposals: Story = {
  args: { ...ProposalWaiting.args, proposals: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 proposals waiting")).toBeVisible()
  },
}

/** A long name and a long pipeline are cut; the code stays whole. */
export const LongName: Story = {
  args: {
    title: "Wexley Junction to Adair Compressor Station No. 4",
    code: "S-0148",
    pipeline: "Northern Plains Transmission and Gathering System · P-031",
    facts: [
      { label: "Owner", value: "Northern Plains Gas and Transmission Co." },
      { label: "Diameter", value: "20 in" },
      { label: "First seen", value: "1955 edition" },
      { label: "Last seen", value: "1965 edition" },
      { label: "Length", value: "180 km" },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("S-0148")).toBeVisible()
  },
}
