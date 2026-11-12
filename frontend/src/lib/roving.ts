import type { KeyboardEvent } from "react"

/**
 * Arrow-key movement for a list or tree whose items carry `data-roving`.
 * Put it on the container's onKeyDown. Returns true when it moved focus.
 */
export function moveRovingFocus(event: KeyboardEvent<HTMLElement>): boolean {
  const { key } = event
  if (
    key !== "ArrowDown" &&
    key !== "ArrowUp" &&
    key !== "Home" &&
    key !== "End"
  ) {
    return false
  }
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-roving]")
  )
  if (items.length === 0) return false
  const current = items.indexOf(document.activeElement as HTMLElement)
  let next: number
  if (key === "Home") next = 0
  else if (key === "End") next = items.length - 1
  else if (key === "ArrowDown") next = Math.min(current + 1, items.length - 1)
  else next = Math.max(current - 1, 0)
  event.preventDefault()
  items[next]?.focus()
  return true
}

/** Enter and Space act like a click on a row that is not a button. */
export function isActivate(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " "
}
