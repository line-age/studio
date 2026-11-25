import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import type { AgentFinding } from "@/data/agent/answer"
import { inStudio, type CardStoryArgs } from "@/test/studio-story"

import {
  AgentFindingCard,
  PipelineOfSection,
  ProposeOutcomes,
} from "./agent-finding"

/**
 * What cite found, as one card (Figma section 29, board B), on the invented
 * test network. Propose makes a candidate claim; a person decides it.
 */
const finding: AgentFinding = {
  handle: "F1",
  section_id: "s-1",
  attribute: "owner",
  value: "Alder Gas Co.",
  date_words: "by March 1932",
  quote: "The Alder Gas Co. has completed its line from Alder to Birch.",
  source: "Invented Archive",
  title: "Invented Gas Review 1932-03-01: Vol 32 Iss 3",
  date: "1932-03-01",
  url: "https://example.org/review/32/3/41",
  confidence: 0.85,
  checks: [
    {
      label: "The quote is on the page, word for word",
      passed: true,
      note: "",
    },
    { label: "The company is named in the passage", passed: true, note: "" },
    {
      label: "A town of the section is named in the passage",
      passed: true,
      note: "",
    },
    { label: "The date fits the years searched", passed: true, note: "" },
    { label: "A second source says the same", passed: false, note: "" },
  ],
  lead: false,
  flags: [],
  places_matched: ["Alder", "Birch"],
  places_given: ["Birch"],
  proposable: true,
}

type Args = React.ComponentProps<typeof AgentFindingCard> & CardStoryArgs

const meta = {
  title: "Studio/Agent/FindingCard",
  component: AgentFindingCard,
  decorators: [inStudio()],
  // The grey block's colours: a token question for Figma (see DecisionCard).
  parameters: { a11y: { test: "todo" } },
  args: {
    finding,
    onPropose: fn(),
    onReport: fn(),
    onStart: fn(),
    onStop: fn(),
    onAsk: fn(),
    onDraft: fn(),
  },
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

/** Found: Propose sends it to be decided; Dismiss writes nothing. */
export const Found: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Propose" }))
    await expect(args.onPropose).toHaveBeenCalledWith("F1", undefined)
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }))
    await expect(args.onReport).toHaveBeenCalledWith(
      "F1",
      "dismissed",
      undefined
    )
  },
}

/** An owner goes to the section's pipeline, or this section only. */
export const OwnerToPipeline: Story = {
  name: "Owner to the pipeline",
  decorators: [
    (Story) => (
      <PipelineOfSection value={() => ({ id: "p-1", name: "North line" })}>
        <Story />
      </PipelineOfSection>
    ),
  ],
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByText("Goes to")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Propose" }))
    await expect(args.onPropose).toHaveBeenCalledWith("F1", "p-1")
    await userEvent.click(
      canvas.getByRole("button", { name: "This section only" })
    )
    await expect(canvas.queryByText("Goes to")).toBeNull()
  },
}

/** In doubt: says why; still the person's to propose. */
export const InDoubt: Story = {
  name: "In doubt",
  args: {
    finding: {
      ...finding,
      flags: [
        { flag: "towns", reason: "The page names the line by its towns." },
      ],
    },
  },
}

/** A lead: too little ties it to the section. Shown with its link, never proposed. */
export const Lead: Story = {
  args: {
    finding: {
      ...finding,
      lead: true,
      confidence: 0.4,
      checks: finding.checks.map((c, i) => ({ ...c, passed: i === 0 })),
      places_matched: [],
      places_given: [],
      proposable: false,
      not_proposable:
        "its confidence, 0.40, is below what a finding needs (0.60)",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("0.40, 1 of 5 checks")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Propose" })).toBeNull()
    await expect(canvas.getByRole("link", { name: /Open page/ })).toBeVisible()
  },
}

/** Proposed: a person decides it in the inbox. */
export const Proposed: Story = {
  decorators: [
    (Story) => (
      <ProposeOutcomes
        value={
          new Map([
            [
              "F1",
              {
                state: "proposed" as const,
                text: "A candidate owner, cited to this page.",
              },
            ],
          ])
        }
      >
        <Story />
      </ProposeOutcomes>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Open in inbox" })
    ).toBeVisible()
  },
}

/** Not offered: says why. */
export const NotOffered: Story = {
  name: "Not offered",
  args: {
    finding: {
      ...finding,
      attribute: "built",
      proposable: false,
      not_proposable: "It says the line ran by then, not when it was built.",
    },
  },
}

/** Dismissed, as the thread holds it. */
export const Dismissed: Story = { args: { outcome: { state: "dismissed" } } }
