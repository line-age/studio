import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Composer } from "./composer"

describe("the message box", () => {
  it("sends on Enter and starts a new line on Shift+Enter", async () => {
    const onSend = vi.fn()
    render(<Composer placeholder="Ask" onSend={onSend} />)
    const box = screen.getByLabelText("Message to the Agent")
    await userEvent.type(box, "first{Shift>}{Enter}{/Shift}second")
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.keyboard("{Enter}")
    expect(onSend).toHaveBeenCalledWith("first\nsecond")
    expect(box).toHaveValue("")
  })

  it("does not send an empty message on Enter", async () => {
    const onSend = vi.fn()
    render(<Composer placeholder="Ask" onSend={onSend} />)
    await userEvent.type(
      screen.getByLabelText("Message to the Agent"),
      "  {Enter}"
    )
    expect(onSend).not.toHaveBeenCalled()
  })
})
