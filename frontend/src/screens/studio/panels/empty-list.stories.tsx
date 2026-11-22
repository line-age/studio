import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { EmptyList } from "./list-parts"

/* What the list says when it has no rows: never a blank. */

const meta = {
  title: "Studio/List/EmptyList",
  component: EmptyList,
  args: {
    search: null,
    total: 12,
    hasSections: true,
    scope: "all",
    followsMap: false,
  },
} satisfies Meta<typeof EmptyList>

export default meta
type Story = StoryObj<typeof meta>

/** Pipelines, on data with none: what a pipeline is and how one is made. */
export const NoPipelines: Story = {
  name: "No pipelines",
  args: { scope: "pipelines", total: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^No pipelines yet\./)).toBeVisible()
    await expect(canvas.getByText(/Make pipeline/)).toBeVisible()
  },
}

/** Unplaced, when every section is in a pipeline. */
export const EveryPlaced: Story = {
  name: "Every section placed",
  args: { scope: "unplaced", total: 0 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Every section is in a pipeline.")
    ).toBeVisible()
  },
}

/** A network with no sections at all, whatever the switch says. */
export const NoSections: Story = {
  name: "No sections",
  args: { scope: "unplaced", total: 0, hasSections: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("This network has no sections.")
    ).toBeVisible()
  },
}

/** The list follows the map, and nothing is in view: says how to get some. */
export const NothingInView: Story = {
  name: "Nothing in view",
  args: { followsMap: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Nothing in the map view\./)).toBeVisible()
  },
}

/** The filters left nothing. */
export const NothingMatchesFilters: Story = {
  name: "Filters left nothing",
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Nothing matches the filters.")).toBeVisible()
  },
}

/** A search that found nothing, said as it happens. */
export const SearchFoundNothing: Story = {
  name: "Search found nothing",
  args: { search: { query: "Birch ", outside: 0 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Nothing matches “Birch”."
    )
  },
}

/** A search that found something, but only outside the filters. */
export const SearchOutsideFilters: Story = {
  name: "Search found it outside the filters",
  args: { search: { query: "Birch", outside: 2 } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Nothing inside the filters matches “Birch”."
    )
  },
}
