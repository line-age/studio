import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Citation } from "@/data/schema"

import { SourceList } from "./source-list"

/* Invented citations only, never real store data. */

const citations: Citation[] = [
  {
    source: "Invented trunk map, 1931",
    sourceId: "src-a",
    sourceKind: "map_sheet",
    locator: "NE quadrant",
  },
  {
    source: "Invented trunk map, 1931",
    sourceId: "src-a",
    sourceKind: "map_sheet",
    locator: "SW quadrant",
  },
  {
    source: "Invented Gas Review, 1931",
    sourceId: "src-b",
    url: "https://example.invalid/review",
  },
]

describe("SourceList", () => {
  it("lists each source once, marking the one cited twice as 2 passages", () => {
    render(
      <SourceList citations={citations} selectedIndex={0} onSelect={vi.fn()} />
    )
    const sources = screen.getByRole("list", { name: "Sources" })
    const rows = within(sources).getAllByRole("button")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Invented trunk map, 1931")
    expect(rows[0]).toHaveTextContent("2 passages")
    expect(rows[1]).not.toHaveTextContent("passages")
  })

  it("selects the source's first citation when its row is clicked", async () => {
    const onSelect = vi.fn()
    render(
      <SourceList citations={citations} selectedIndex={0} onSelect={onSelect} />
    )
    const sources = screen.getByRole("list", { name: "Sources" })
    await userEvent.click(
      within(sources).getByRole("button", { name: /Invented Gas Review/ })
    )
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it("marks the row holding the selected citation as pressed", () => {
    render(
      <SourceList citations={citations} selectedIndex={1} onSelect={vi.fn()} />
    )
    const sources = screen.getByRole("list", { name: "Sources" })
    const rows = within(sources).getAllByRole("button")
    expect(rows[0]).toHaveAttribute("aria-pressed", "true")
    expect(rows[1]).toHaveAttribute("aria-pressed", "false")
  })
})
