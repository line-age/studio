import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Citation, Section } from "@/data/schema"
import { testNetwork } from "@/test/network"

import { CitationFooter } from "./footer"

/* Invented citations and sections only, never real store data. */

function section(): Section {
  return testNetwork().sections[0]
}

describe("CitationFooter", () => {
  it("hides Open source when the citation has no web address or archived copy", () => {
    const citation: Citation = { source: "A source" }
    render(<CitationFooter section={section()} citation={citation} />)
    expect(
      screen.queryByRole("link", { name: "Open source" })
    ).not.toBeInTheDocument()
  })

  it("shows Open source linking to the citation's own web address", () => {
    const citation: Citation = {
      source: "A source",
      url: "https://example.invalid/page",
    }
    render(<CitationFooter section={section()} citation={citation} />)
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute(
      "href",
      "https://example.invalid/page"
    )
  })

  it("shows Open source linking to the archived copy when there is no own address", () => {
    const citation: Citation = {
      source: "A source",
      archiveUrl: "https://web.archive.invalid/copy",
    }
    render(<CitationFooter section={section()} citation={citation} />)
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute(
      "href",
      "https://web.archive.invalid/copy"
    )
  })
})
