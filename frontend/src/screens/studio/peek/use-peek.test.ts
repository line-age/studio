import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PEEK_DELAY,
  PEEK_LEAVE,
  placePeek,
  usePeek,
  type PeekAnchor,
} from "./use-peek"

const within = { left: 300, top: 40, right: 1300, bottom: 900 }
const at = (x: number, y: number): PeekAnchor => ({
  kind: "pointer",
  x,
  y,
  within,
})

describe("placePeek", () => {
  it("opens below and right of the pointer", () => {
    expect(placePeek(at(500, 200), 940)).toEqual({ left: 514, top: 214 })
  })

  it("turns left where the card would leave the map on the right", () => {
    expect(placePeek(at(1200, 200), 940)).toEqual({ left: 906, top: 214 })
  })

  it("never starts left of the map", () => {
    const narrow: PeekAnchor = {
      kind: "pointer",
      x: 500,
      y: 200,
      within: { ...within, left: 400, right: 600 },
    }
    expect(placePeek(narrow, 940)).toEqual({ left: 400, top: 214 })
  })

  it("opens upward where the card would leave the map at the bottom", () => {
    expect(placePeek(at(500, 800), 940)).toEqual({ left: 514, bottom: 154 })
  })

  it("opens left of a row, level with it", () => {
    expect(
      placePeek(
        { kind: "row", rect: { left: 1000, top: 120, bottom: 156 } },
        940
      )
    ).toEqual({ left: 712, top: 120 })
  })

  it("hangs from the row's bottom when the window ends below it", () => {
    expect(
      placePeek(
        { kind: "row", rect: { left: 1000, top: 860, bottom: 896 } },
        940
      )
    ).toEqual({ left: 712, bottom: 44 })
  })
})

describe("usePeek", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (first: string | null = null) => {
    const anchor = { current: at(500, 200) as PeekAnchor | null }
    const hook = renderHook(({ target }) => usePeek(target, anchor), {
      initialProps: { target: first },
    })
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))
    return { ...hook, anchor, wait }
  }

  it("shows a card once the pointer has rested on a section", () => {
    const { result, rerender, wait } = setup()
    rerender({ target: "s-1" })
    wait(PEEK_DELAY - 1)
    expect(result.current).toBeNull()
    wait(1)
    expect(result.current).toEqual({
      id: "s-1",
      anchor: at(500, 200),
      leaving: false,
    })
  })

  it("shows nothing for a pointer that only passes over", () => {
    const { result, rerender, wait } = setup()
    rerender({ target: "s-1" })
    wait(PEEK_DELAY - 50)
    rerender({ target: null })
    wait(1000)
    expect(result.current).toBeNull()
  })

  it("keeps the card where it showed while the pointer moves along the section", () => {
    const { result, rerender, anchor, wait } = setup("s-1")
    wait(PEEK_DELAY)
    anchor.current = at(620, 260)
    rerender({ target: "s-1" })
    wait(1000)
    expect(result.current?.anchor).toEqual(at(500, 200))
  })

  it("fades the card out when the pointer leaves, then takes it away", () => {
    const { result, rerender, wait } = setup("s-1")
    wait(PEEK_DELAY)
    rerender({ target: null })
    expect(result.current?.leaving).toBe(true)
    wait(PEEK_LEAVE)
    expect(result.current).toBeNull()
  })

  it("keeps the card when the pointer comes back before it has gone", () => {
    const { result, rerender, wait } = setup("s-1")
    wait(PEEK_DELAY)
    rerender({ target: null })
    wait(PEEK_LEAVE - 10)
    rerender({ target: "s-1" })
    wait(1000)
    expect(result.current).toMatchObject({ id: "s-1", leaving: false })
  })

  it("moves to another section's card after the same wait, where the pointer is then", () => {
    const { result, rerender, anchor, wait } = setup("s-1")
    wait(PEEK_DELAY)
    anchor.current = at(700, 300)
    rerender({ target: "s-2" })
    expect(result.current).toMatchObject({ id: "s-1", leaving: true })
    wait(PEEK_DELAY)
    expect(result.current).toEqual({
      id: "s-2",
      anchor: at(700, 300),
      leaving: false,
    })
  })

  it("shows nothing when it was never told where the pointer is", () => {
    const { result, anchor, rerender, wait } = setup()
    anchor.current = null
    rerender({ target: "s-1" })
    wait(PEEK_DELAY)
    expect(result.current).toBeNull()
  })
})
