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

  it("keeps the words when the message was not taken", async () => {
    const onSend = vi.fn(() => false)
    render(<Composer placeholder="Ask" onSend={onSend} />)
    const box = screen.getByLabelText("Message to the Agent")
    await userEvent.type(box, "who owns it?{Enter}")
    expect(onSend).toHaveBeenCalledWith("who owns it?")
    expect(box).toHaveValue("who owns it?")
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

  it("turns send into Stop while the Agent works", async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    const { rerender } = render(
      <Composer placeholder="Ask" onSend={onSend} onStop={onStop} />
    )
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(onStop).toHaveBeenCalledOnce()
    expect(onSend).not.toHaveBeenCalled()
    rerender(<Composer placeholder="Ask" onSend={onSend} />)
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull()
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument()
  })
})
