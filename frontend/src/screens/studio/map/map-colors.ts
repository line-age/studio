/*
 * The map draws on a canvas, which cannot read CSS variables by itself. This
 * reads the map tokens once so the map style never holds a raw colour.
 */
export interface MapColors {
  line: string
  ghost: string
  proposed: string
  selected: string
}

export function readMapColors(
  element: Element = document.documentElement
): MapColors {
  const style = getComputedStyle(element)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    line: token("--map-line"),
    ghost: token("--map-ghost"),
    proposed: token("--map-proposed"),
    selected: token("--map-selected"),
  }
}
