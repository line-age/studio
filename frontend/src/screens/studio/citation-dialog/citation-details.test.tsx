import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { Citation, Section } from "@/data/schema"
import { testNetwork } from "@/test/network"

import { CitationDetails } from "./citation-details"

/* Invented citations and sections only, never real store data. */

function section(claims: Section["claims"]): Section {
  return { ...testNetwork().sections[0], claims }
}

const scanNoQuote: Citation = {
  id: "c-1",
  source: "Invented trunk map, 1931",
  role: "map_shows",
  asOf: "1931-06",
  locator: "NE quadrant",
  identifier: "sheet-14",
  sourceKind: "map_sheet",
  confidence: 0.8,
}

describe("CitationDetails", () => {
  it("shows the source, role, edition, where, identifier and confidence", () => {
    render(<CitationDetails citation={scanNoQuote} section={section([])} />)
    expect(screen.getByText("Invented trunk map, 1931")).toBeInTheDocument()
    expect(screen.getByText("Shown on")).toBeInTheDocument()
    expect(
      screen.getByText("1931 edition, as of 30 June 1931")
    ).toBeInTheDocument()
    expect(screen.getByText("NE quadrant")).toBeInTheDocument()
    expect(screen.getByText("sheet-14")).toBeInTheDocument()
    expect(screen.getByText("0.8 of 1")).toBeInTheDocument()
  })

  it("says a scan with no quote has none, and shows no Quote row", () => {
    render(<CitationDetails citation={scanNoQuote} section={section([])} />)
    expect(screen.getByText("No quote, scanned map")).toBeInTheDocument()
    expect(screen.queryByText("Quote")).not.toBeInTheDocument()
  })

  it("shows a recorded quote under a Quote row", () => {
    render(
      <CitationDetails
        citation={{ source: "Invented Gas Review, 1931", quote: '"12 IN."' }}
        section={section([])}
      />
    )
    expect(screen.getByText("Quote")).toBeInTheDocument()
    expect(screen.getByText('"12 IN."')).toBeInTheDocument()
  })

  it("says when the citation backs more than one claim", () => {
    const shared: Citation = { id: "c-shared", source: "A source" }
    const claims = [
      {
        attribute: "Geometry",
        value: "Traced line",
        citations: [shared],
        proposals: [],
      },
      {
        attribute: "Last seen",
        value: "2026",
        citations: [shared],
        proposals: [],
      },
    ]
    render(<CitationDetails citation={shared} section={section(claims)} />)
    expect(screen.getByText("Supports 2 claims")).toBeInTheDocument()
  })

  it("truncates a long title and shows the full title on focus", async () => {
    const longTitle = "A".repeat(120)
    const { container } = render(
      <CitationDetails citation={{ source: longTitle }} section={section([])} />
    )
    const trigger = screen.getByText(longTitle)
    expect(trigger).toHaveClass("truncate")
    const user = userEvent.setup()
    await user.tab()
    await screen.findByText(longTitle, {
      selector: '[data-slot="tooltip-content"]',
    })
    expect(
      container.ownerDocument.querySelector('[data-slot="tooltip-content"]')
    ).toHaveTextContent(longTitle)
  })
})
