import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn } from "storybook/test"

import { Icon } from "@/components/icons/icon"
import { StatusLabel } from "@/components/status-label"
import { Button } from "@/components/ui/button"

import {
  DecisionCard,
  DecisionCardActions,
  DecisionCardDoubt,
  DecisionCardHead,
  DecisionCardLink,
  DecisionCardOutcome,
  DecisionCardProgress,
  DecisionCardRow,
  DecisionCardRows,
} from "./decision-card"

/**
 * One card for every decision in the chat (Figma section 28: uses on board A
 * `532:23604`, states on board B `532:23763`; cite's on section 29). All
 * sample data is invented.
 */
const meta = {
  title: "Parts/DecisionCard",
  component: DecisionCard,
  decorators: [
    (Story) => (
      <div className="w-104">
        <Story />
      </div>
    ),
  ],
  // The grey block's labels (muted-foreground, 4.32:1) and its sections in the
  // link colour (4.42:1) on muted are under the 4.5 text needs. Figma's tokens,
  // as section 28 has them: a token question for the owner (the same as
  // camera-status's), reported in the a11y panel, not failed, until decided.
  parameters: { a11y: { test: "todo" } },
  args: {
    by: "you",
    label: "Add 4 sections to Tolland lateral",
    children: null,
    onApprove: fn(),
    onDecline: fn(),
  },
} satisfies Meta<
  React.ComponentProps<typeof DecisionCard> & {
    onApprove: () => void
    onDecline: () => void
  }
>

export default meta
type Story = StoryObj<typeof meta>

const SECTIONS = "S-0150, S-0151, S-0152, S-0153"

function Change({
  by = "you",
  children,
}: {
  by?: "you" | "agent" | "closed"
  children?: React.ReactNode
}) {
  return (
    <DecisionCard by={by} label="Add 4 sections to Tolland lateral">
      <DecisionCardHead
        by={by}
        title="Add 4 sections to Tolland lateral"
        who="Your change. Made when you approve."
      />
      <DecisionCardRows>
        <DecisionCardRow label="Sections" code>
          {SECTIONS}
        </DecisionCardRow>
        <DecisionCardRow label="Pipeline" code>
          Tolland lateral · P-031
        </DecisionCardRow>
        <DecisionCardRow label="Note">
          S-0152 is in Harlow main now. It moves.
        </DecisionCardRow>
      </DecisionCardRows>
      {children}
    </DecisionCard>
  )
}

/** Waiting: your change, made only when you approve (board A 1, board B). */
export const Waiting: Story = {
  render: (args) => (
    <Change>
      <DecisionCardActions>
        <Button size="sm" onClick={args.onApprove}>
          <Icon name="check" data-icon="inline-start" />
          Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={args.onDecline}>
          Decline
        </Button>
      </DecisionCardActions>
    </Change>
  ),
  play: async ({ canvas, userEvent, args, step }) => {
    await step("Approve makes it", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Approve" }))
      await expect(args.onApprove).toHaveBeenCalledOnce()
    })
    await step("Decline is the other way out", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Decline" }))
      await expect(args.onDecline).toHaveBeenCalledOnce()
    })
  },
}

/** Saving: the button says what is happening and takes no second press. */
export const Saving: Story = {
  render: () => (
    <Change>
      <DecisionCardActions>
        <Button size="sm" disabled>
          Approving
        </Button>
      </DecisionCardActions>
    </Change>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Approving" })
    ).toBeDisabled()
  },
}

/** Done: what it did, by whom and when; Show on map selects the sections. */
export const Done: Story = {
  render: () => (
    <Change>
      <DecisionCardOutcome tone="done" title="Done">
        4 sections are in Tolland lateral. By you, 23 Nov 2026, 14:02.
      </DecisionCardOutcome>
      <DecisionCardActions>
        <Button size="sm" variant="outline">
          Show on map
        </Button>
      </DecisionCardActions>
    </Change>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Done")
  },
}

/** Declined: grey, nothing changed. */
export const Declined: Story = {
  render: () => (
    <Change by="closed">
      <DecisionCardOutcome tone="closed" title="Declined">
        Nothing was changed.
      </DecisionCardOutcome>
    </Change>
  ),
}

/** Failed: the reason in plain words, and a way on. */
export const Failed: Story = {
  render: () => (
    <Change>
      <DecisionCardOutcome
        tone="failed"
        title="Couldn't save. Nothing was changed."
      >
        S-0153 belongs to another network, and a pipeline holds one network.
      </DecisionCardOutcome>
      <DecisionCardActions>
        <Button size="sm" variant="outline">
          Try again
        </Button>
        <Button size="sm" variant="ghost">
          Decline
        </Button>
      </DecisionCardActions>
    </Change>
  ),
}

/** Out of date: what it showed is no longer true, so nothing was written. */
export const OutOfDate: Story = {
  name: "Out of date",
  render: () => (
    <Change>
      <DecisionCardOutcome
        tone="out-of-date"
        title="Out of date. Nothing was changed."
      >
        S-0152 was moved to Calder Valley after this was offered.
      </DecisionCardOutcome>
      <DecisionCardActions>
        <Button size="sm" variant="outline">
          Ask again
        </Button>
      </DecisionCardActions>
    </Change>
  ),
}

/** Your edit: a value you typed, saved as the Edit window saves it (board A 2). */
export const YourEdit: Story = {
  name: "Your edit",
  render: (args) => (
    <DecisionCard by="you" label="Set the diameter of 4 sections">
      <DecisionCardHead
        by="you"
        title="Set the diameter of 4 sections"
        who="Your edit. Saved as yours, as the Edit window does."
      />
      <DecisionCardRows>
        <DecisionCardRow label="Sections" code>
          {SECTIONS}
        </DecisionCardRow>
        <DecisionCardRow label="Diameter">12 in</DecisionCardRow>
        <DecisionCardRow label="Replaces">10 in on S-0151</DecisionCardRow>
        <DecisionCardRow label="Source">Studio edit</DecisionCardRow>
      </DecisionCardRows>
      <DecisionCardActions
        aside={<DecisionCardLink onClick={fn()}>Open in Edit</DecisionCardLink>}
      >
        <Button size="sm" onClick={args.onApprove}>
          <Icon name="check" data-icon="inline-start" />
          Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={args.onDecline}>
          Decline
        </Button>
      </DecisionCardActions>
    </DecisionCard>
  ),
}

/** Found by cite: proposed, a person decides; in doubt says why (board A 3). */
export const FoundByCite: Story = {
  name: "Found by cite",
  render: (args) => (
    <DecisionCard by="agent" label="Owner: Example Pipe Line Co.">
      <DecisionCardHead
        by="agent"
        title="Owner: Example Pipe Line Co."
        who="Found by cite, not saved. Propose sends it to be decided."
        aside={
          <DecisionCardLink href="https://example.org/gazette/32/3/41">
            Open page
          </DecisionCardLink>
        }
      />
      <DecisionCardRows>
        <DecisionCardRow label="Section" code>
          S-0142 · Harlow to Brecken
        </DecisionCardRow>
        <DecisionCardRow label="Page says">
          “The Example Pipe Line Co. has completed its line from Harlow to
          Brecken.”
        </DecisionCardRow>
        <DecisionCardRow label="Source">
          Example Gazette, vol. 32 no. 3, p. 41 · March 1932
        </DecisionCardRow>
      </DecisionCardRows>
      <DecisionCardDoubt>
        In doubt: the page names the line by its towns, not by this section.
      </DecisionCardDoubt>
      <DecisionCardActions>
        <Button size="sm" onClick={args.onApprove}>
          Propose
        </Button>
        <Button size="sm" variant="ghost" onClick={args.onDecline}>
          Dismiss
        </Button>
      </DecisionCardActions>
    </DecisionCard>
  ),
  play: async ({ canvas, userEvent, args }) => {
    await expect(
      canvas.getByRole("link", { name: /Open page/ })
    ).toHaveAttribute("target", "_blank")
    await userEvent.click(canvas.getByRole("button", { name: "Propose" }))
    await expect(args.onApprove).toHaveBeenCalledOnce()
  },
}

/** Proposed by a tool: you decide; Unknown keeps its one mark (board A 4). */
export const ProposedByATool: Story = {
  name: "Proposed by a tool",
  render: () => (
    <DecisionCard by="agent" label="Last seen of S-0142: 1929">
      <DecisionCardHead
        by="agent"
        title="Last seen of S-0142: 1929"
        who="Proposed by the stitch tool, score 0.99. You decide."
      />
      <DecisionCardRows>
        <DecisionCardRow label="Last seen">
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusLabel status="unknown" size="sm" />→ 1929, not on 1931
          </span>
        </DecisionCardRow>
        <DecisionCardRow label="Why">
          A line traced as gone between the 1929 and 1931 editions runs along
          this whole section.
        </DecisionCardRow>
      </DecisionCardRows>
      <DecisionCardActions
        aside={<DecisionCardLink onClick={fn()}>Show on map</DecisionCardLink>}
      >
        <Button size="sm">
          <Icon name="check" data-icon="inline-start" />
          Confirm
        </Button>
        <Button size="sm" variant="ghost">
          Reject
        </Button>
      </DecisionCardActions>
    </DecisionCard>
  ),
}

/** Searching: cite's steps and a bar; Stop ends it (section 29, A4). */
export const Searching: Story = {
  render: () => (
    <DecisionCard by="agent" label="Searching our sources for the owner">
      <DecisionCardHead
        by="agent"
        title="Searching our sources for the owner"
        who="cite is reading the pages. The answer comes here when it is done."
      />
      <DecisionCardRows>
        <DecisionCardRow label="Section" code>
          S-0142 · Harlow to Brecken
        </DecisionCardRow>
        <DecisionCardRow label="Years">1931 and 1932</DecisionCardRow>
        <DecisionCardRow label="Towns">
          Harlow, Brecken, Sample City
        </DecisionCardRow>
      </DecisionCardRows>
      <DecisionCardProgress
        label="Searching our sources"
        steps={[
          "Found 23 pages that name Harlow or Brecken",
          "Reading page 14 of 23",
        ]}
      />
      <DecisionCardActions
        aside={<span className="type-ui-xs text-muted-foreground">2 min</span>}
      >
        <Button size="sm" variant="outline">
          Stop the search
        </Button>
      </DecisionCardActions>
    </DecisionCard>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("progressbar", { name: "Searching our sources" })
    ).toBeVisible()
  },
}

/** A long title and long values wrap; nothing is cut. */
export const LongText: Story = {
  name: "Long text",
  render: () => (
    <DecisionCard by="you" label="Long">
      <DecisionCardHead
        by="you"
        title="Add 23 sections to Supplementary western interconnection lateral number two"
        who="Your change. Made when you approve."
      />
      <DecisionCardRows>
        <DecisionCardRow label="Sections" code>
          S-0150, S-0151, S-0152, S-0153, S-0154, S-0155, S-0156, S-0157,
          S-0158, S-0159, S-0160, S-0161
        </DecisionCardRow>
      </DecisionCardRows>
    </DecisionCard>
  ),
}
