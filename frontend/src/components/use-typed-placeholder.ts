import { useEffect, useState } from "react"

/*
 * The empty chat's placeholder writes one example at a time (Figma section 28,
 * board E `537:23933`): letter by letter, holds it, clears it, writes the
 * next. With reduced motion the examples swap whole, without typing. Nothing
 * here is sent: it is a placeholder, and Tab is what takes an example.
 */

/** How long one letter takes, how long a written example holds, the pause after. */
export const TYPE_MS = 55
export const HOLD_MS = 1800
export const GAP_MS = 400
/** With reduced motion, how long each example shows whole. */
export const SWAP_MS = 3200

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * The example being written now: `shown` is what is on screen so far, `full`
 * the whole of it (what Tab takes). Null while `active` is false or there are
 * no examples.
 */
export function useTypedPlaceholder(
  examples: readonly string[],
  active: boolean
): { shown: string; full: string } | null {
  const [reduced] = useState(prefersReducedMotion)
  const [at, setAt] = useState({ example: 0, letters: 0 })
  const key = examples.join("\u0000")
  const [seenKey, setSeenKey] = useState(key)
  // New examples (something else attached) start from the first.
  if (key !== seenKey) {
    setSeenKey(key)
    setAt({ example: 0, letters: 0 })
  }
  const full = examples.length > 0 ? examples[at.example % examples.length] : ""

  useEffect(() => {
    if (!active || examples.length === 0) return
    const next = () =>
      setAt((a) => ({ example: (a.example + 1) % examples.length, letters: 0 }))
    if (reduced) {
      const timer = setTimeout(next, SWAP_MS)
      return () => clearTimeout(timer)
    }
    const done = at.letters >= full.length
    const timer = setTimeout(
      done ? next : () => setAt((a) => ({ ...a, letters: a.letters + 1 })),
      done ? HOLD_MS + GAP_MS : TYPE_MS
    )
    return () => clearTimeout(timer)
  }, [active, at, examples.length, full.length, reduced])

  if (!active || examples.length === 0) return null
  return { shown: reduced ? full : full.slice(0, at.letters), full }
}
