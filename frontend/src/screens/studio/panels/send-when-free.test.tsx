import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SendWhenFree } from "./send-when-free"

describe("a message typed while the Agent answers", () => {
  it("is not sent while the Agent is still working", () => {
    const send = vi.fn()
    render(<SendWhenFree working onFree={send} />)
    expect(send).not.toHaveBeenCalled()
  })

  it("is sent once when the Agent is free", () => {
    const send = vi.fn()
    const { rerender } = render(<SendWhenFree working onFree={send} />)
    rerender(<SendWhenFree working={false} onFree={send} />)
    rerender(<SendWhenFree working={false} onFree={send} />)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("is sent at once when the Agent was already free", () => {
    const send = vi.fn()
    render(<SendWhenFree working={false} onFree={send} />)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
