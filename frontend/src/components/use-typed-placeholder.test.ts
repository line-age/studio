import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GAP_MS,
  HOLD_MS,
  SWAP_MS,
  TYPE_MS,
  useTypedPlaceholder,
} from "./use-typed-placeholder"

/* The empty box's examples: letter by letter, a hold, the next. Fake time. */

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const EXAMPLES = ["Ab", "Cd"]

describe("useTypedPlaceholder", () => {
  it("writes an example a letter at a time, holds it, then writes the next", () => {
    const { result } = renderHook(() => useTypedPlaceholder(EXAMPLES, true))
    expect(result.current).toEqual({ shown: "", full: "Ab" })
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(result.current?.shown).toBe("A")
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(result.current?.shown).toBe("Ab")
    act(() => vi.advanceTimersByTime(HOLD_MS + GAP_MS))
    expect(result.current).toEqual({ shown: "", full: "Cd" })
  })

  it("writes nothing while not active, or with no examples", () => {
    expect(
      renderHook(() => useTypedPlaceholder(EXAMPLES, false)).result.current
    ).toBeNull()
    expect(
      renderHook(() => useTypedPlaceholder([], true)).result.current
    ).toBeNull()
  })

  it("swaps whole examples, without typing, with reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({ matches: query.includes("reduce"), media: query }) as MediaQueryList
    )
    const { result } = renderHook(() => useTypedPlaceholder(EXAMPLES, true))
    expect(result.current).toEqual({ shown: "Ab", full: "Ab" })
    act(() => vi.advanceTimersByTime(SWAP_MS))
    expect(result.current).toEqual({ shown: "Cd", full: "Cd" })
  })

  it("starts again from the first when the examples change", () => {
    const { result, rerender } = renderHook(
      ({ examples }) => useTypedPlaceholder(examples, true),
      { initialProps: { examples: EXAMPLES } }
    )
    // Each step is set once the one before has shown.
    act(() => vi.advanceTimersByTime(TYPE_MS))
    act(() => vi.advanceTimersByTime(TYPE_MS))
    act(() => vi.advanceTimersByTime(HOLD_MS + GAP_MS))
    expect(result.current?.full).toBe("Cd")
    rerender({ examples: ["Ef"] })
    expect(result.current).toEqual({ shown: "", full: "Ef" })
  })
})
