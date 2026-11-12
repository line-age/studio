import { createContext, use } from "react"

import type { LeftPanel } from "./studio-store"

/*
 * Which left panel is open. It is React state (not the store) so the switch
 * can run inside a transition and animate.
 */
interface LeftPanelValue {
  panel: LeftPanel
  /** False when the person has shut the left panel from the rail. */
  open: boolean
  /** Show this panel, opening the left side if it is shut. */
  openPanel: (panel: LeftPanel) => void
  /** The rail: the open panel's own item shuts the left side. */
  togglePanel: (panel: LeftPanel) => void
}

export const LeftPanelContext = createContext<LeftPanelValue | null>(null)

export function useLeftPanel(): LeftPanelValue {
  const value = use(LeftPanelContext)
  if (!value) {
    throw new Error("useLeftPanel must be used inside the Studio screen")
  }
  return value
}
