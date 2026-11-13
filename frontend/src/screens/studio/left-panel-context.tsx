import { createContext, use } from "react"

import type { LeftPanel } from "./studio-store"

/*
 * Which left panel is showing, and whether the side panels are open at all.
 * It is React state (not the store) so the switch can run inside a transition
 * and animate.
 */
interface LeftPanelValue {
  panel: LeftPanel
  /**
   * False when the person has hidden the side panels. It covers both: the
   * left panel and the properties on the right. The rail stays.
   */
  open: boolean
  /** Show this panel, bringing the side panels back if they are hidden. */
  openPanel: (panel: LeftPanel) => void
  /** The rail: the open panel's own item hides the side panels. */
  togglePanel: (panel: LeftPanel) => void
  /** Show or hide both side panels, keeping the panel that was open. */
  toggleOpen: () => void
}

export const LeftPanelContext = createContext<LeftPanelValue | null>(null)

export function useLeftPanel(): LeftPanelValue {
  const value = use(LeftPanelContext)
  if (!value) {
    throw new Error("useLeftPanel must be used inside the Studio screen")
  }
  return value
}
