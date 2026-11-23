import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Question } from "@/data/question"

import { useOutcomeQueue } from "./use-outcome-queue"

/*
 * What came of a card goes to the thread even when the Agent is busy as the
 * press ends (found in review): held until the Agent is free, sent once, kept
 * if the send is refused.
 */

type Ask = (question: Question, onFailed?: () => void) => unknown

function setup(working: boolean, ask: Ask) {
  return renderHook(
    ({ working, ask }) => useOutcomeQueue({ working, ask }, "gas"),
    { initialProps: { working, ask } }
  )
}

const sentOffers = (ask: ReturnType<typeof vi.fn>) =>
  ask.mock.calls.map(([q]) => (q as Question).action?.offer)

describe("useOutcomeQueue", () => {
  it("sends at once while the Agent is free", () => {
    const ask = vi.fn()
    const { result } = setup(false, ask)
    act(() => result.current("offer-1", "done", "By you."))
    expect(ask).toHaveBeenCalledOnce()
    expect(ask.mock.calls[0][0]).toEqual({
      words: "Approve",
      about: [],
      network: "gas",
      action: {
        kind: "outcome",
        offer: "offer-1",
        state: "done",
        detail: "By you.",
      },
    })
  })

  it("holds it while the Agent works, and sends it once it is free", () => {
    const ask = vi.fn()
    const { result, rerender } = setup(true, ask)
    act(() => result.current("offer-1", "done"))
    expect(ask).not.toHaveBeenCalled()
    rerender({ working: false, ask })
    expect(sentOffers(ask)).toEqual(["offer-1"])
    rerender({ working: false, ask })
    expect(ask).toHaveBeenCalledOnce()
  })

  it("keeps one the service refused, and sends it when the Agent is next free", () => {
    let refuse = true
    const ask = vi.fn((_: Question, onFailed?: () => void) => {
      if (refuse) onFailed?.()
    })
    const { result, rerender } = setup(false, ask)
    act(() => result.current("offer-1", "declined"))
    expect(ask).toHaveBeenCalledOnce()
    refuse = false
    rerender({ working: true, ask })
    rerender({ working: false, ask })
    expect(sentOffers(ask)).toEqual(["offer-1", "offer-1"])
  })

  it("sends several in the order they were made", () => {
    const ask = vi.fn()
    const { result, rerender } = setup(true, ask)
    act(() => {
      result.current("offer-1", "done")
      result.current("F1", "dismissed")
    })
    rerender({ working: false, ask })
    rerender({ working: true, ask })
    rerender({ working: false, ask })
    expect(sentOffers(ask)).toEqual(["offer-1", "F1"])
  })
})
