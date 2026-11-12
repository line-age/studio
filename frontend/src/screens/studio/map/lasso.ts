/*
 * Which lines a freehand loop catches. Everything is in screen pixels: the
 * loop as drawn, and each line already projected. A line is caught when the
 * loop encloses any of its points or its edge crosses the line.
 */

export type Point = readonly [number, number]

export interface ScreenLine {
  id: string
  /** One list of points per part of the line. */
  paths: Point[][]
}

/** Ray casting: is `p` inside the closed `loop`? */
export function pointInLoop(p: Point, loop: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i]
    const [xj, yj] = loop[j]
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Which side of the line a to b the point c lies on. */
const side = (a: Point, b: Point, c: Point) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

/** Do the segments a-b and c-d properly cross? */
function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)
}

function pathTouchesLoop(path: Point[], loop: readonly Point[]): boolean {
  if (path.some((p) => pointInLoop(p, loop))) return true
  for (let i = 1; i < path.length; i += 1) {
    for (let k = 0, j = loop.length - 1; k < loop.length; j = k++) {
      if (cross(path[i - 1], path[i], loop[j], loop[k])) return true
    }
  }
  return false
}

/** The ids of the lines the loop touches or encloses. A loop needs 3 points. */
export function linesInLoop(
  loop: readonly Point[],
  lines: readonly ScreenLine[]
): string[] {
  if (loop.length < 3) return []
  return lines
    .filter((line) => line.paths.some((path) => pathTouchesLoop(path, loop)))
    .map((line) => line.id)
}
