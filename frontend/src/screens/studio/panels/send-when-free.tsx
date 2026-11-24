import { useEffect, useRef } from "react"

/**
 * Sends a message that waited while the Agent answered: `onFree` runs once, as soon as
 * `working` is false. Rendered only while a message waits; it draws nothing.
 */
export function SendWhenFree({
  working,
  onFree,
}: {
  /** The Agent is answering: the message keeps waiting. */
  working: boolean
  /** Sends the waiting message. Called once. */
  onFree: () => void
}) {
  const sent = useRef(false)
  useEffect(() => {
    if (working || sent.current) return
    sent.current = true
    onFree()
  }, [working, onFree])
  return null
}
