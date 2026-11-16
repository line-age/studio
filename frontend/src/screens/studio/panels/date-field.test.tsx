import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DateField } from "./date-field"

describe("DateField", () => {
  it("shows the claim's text in the trigger", () => {
    render(
      <DateField
        id="d"
        value="March 1929"
        isMixed={false}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole("button")).toHaveTextContent("March 1929")
  })

  it("shows Mixed, in place of the text, when the sections disagree", () => {
    render(
      <DateField id="d" value="1929" isMixed={true} onChange={vi.fn()} />
    )
    expect(screen.getByRole("button")).toHaveTextContent("Mixed")
    expect(screen.queryByText("1929")).not.toBeInTheDocument()
  })

  it("can be disabled, such as on store where dates cannot be saved yet", () => {
    render(
      <DateField
        id="d"
        value="1929"
        isMixed={false}
        disabled
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("keeps what the source said under a cleaned-up date, unless it changes", () => {
    render(
      <DateField
        id="d"
        value="1929 edition"
        isMixed={false}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText("Originally: 1929 edition")).toBeInTheDocument()
  })

  it("drops the original hint once the value is no longer what it opened with", () => {
    const { rerender } = render(
      <DateField
        id="d"
        value="1929 edition"
        isMixed={false}
        onChange={vi.fn()}
      />
    )
    rerender(
      <DateField id="d" value="March 1929" isMixed={false} onChange={vi.fn()} />
    )
    expect(
      screen.queryByText(/^Originally:/)
    ).not.toBeInTheDocument()
  })

  it("shows the Last-before-First error under the field", () => {
    render(
      <DateField
        id="d"
        value="1929"
        isMixed={false}
        error="Last seen cannot be before First seen."
        onChange={vi.fn()}
      />
    )
    expect(
      screen.getByText("Last seen cannot be before First seen.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button")).toHaveAttribute("aria-invalid", "true")
  })
})
