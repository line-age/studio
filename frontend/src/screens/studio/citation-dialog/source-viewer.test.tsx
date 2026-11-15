import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Citation } from "@/data/schema"

import { SourceViewer } from "./source-viewer"

/* Invented citations only, never real store data. */

describe("SourceViewer", () => {
  it("renders the unavailable viewer with the sheet name and edition", () => {
    const citation: Citation = {
      source: "Invented trunk map, 1931",
      sourceKind: "map_sheet",
      asOf: "1931-06",
    }
    render(<SourceViewer citation={citation} />)
    expect(screen.getByText("Invented trunk map, 1931")).toBeInTheDocument()
    expect(
      screen.getByText("1931 edition, as of 30 June 1931")
    ).toBeInTheDocument()
  })

  it("renders no zoom control", () => {
    render(<SourceViewer citation={{ source: "Invented trunk map, 1931" }} />)
    expect(
      screen.queryByRole("button", { name: /zoom/i })
    ).not.toBeInTheDocument()
  })

  it("has no edition line when the citation carries no date", () => {
    render(<SourceViewer citation={{ source: "Invented Gas Review, 1931" }} />)
    expect(screen.getByText("Invented Gas Review, 1931")).toBeInTheDocument()
    expect(screen.queryByText(/edition/)).not.toBeInTheDocument()
  })
})
