import { describe, expect, it } from "vitest"

import { linesInLoop, pointInLoop, type Point, type ScreenLine } from "./lasso"

const square: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]

const line = (id: string, ...points: Point[]): ScreenLine => ({
  id,
  paths: [points],
})

describe("lasso", () => {
  it("knows inside from outside", () => {
    expect(pointInLoop([5, 5], square)).toBe(true)
    expect(pointInLoop([15, 5], square)).toBe(false)
  })

  it("catches lines it encloses, lines it crosses, and misses the rest", () => {
    const lines = [
      line("inside", [2, 2], [8, 8]),
      line("crossing", [-5, 5], [15, 5]),
      line("one end in", [5, 5], [50, 50]),
      line("outside", [20, 20], [30, 30]),
      line("beside", [-5, -5], [-5, 15]),
    ]
    expect(linesInLoop(square, lines)).toEqual([
      "inside",
      "crossing",
      "one end in",
    ])
  })

  it("checks every part of a line in several parts", () => {
    const parts: ScreenLine = {
      id: "parts",
      paths: [
        [
          [20, 20],
          [30, 30],
        ],
        [
          [4, 4],
          [6, 6],
        ],
      ],
    }
    expect(linesInLoop(square, [parts])).toEqual(["parts"])
  })

  it("catches nothing with less than a loop", () => {
    const lines = [line("a", [0, 0], [1, 1])]
    expect(
      linesInLoop(
        [
          [0, 0],
          [1, 1],
        ],
        lines
      )
    ).toEqual([])
  })
})
