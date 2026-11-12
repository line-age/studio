import { createContext, use } from "react"

import type { LeftPanel } from "./studio-store"

/*
 * Which left panel is open. It is React state (not the store) so the switch
 * can run inside a transition and animate.
 */
interface LeftPanelValue {
  panel: LeftPanel
  openPanel: (panel: LeftPanel) => void
}

export const LeftPanelContext = createContext<LeftPanelValue | null>(null)

export function useLeftPanel(): LeftPanelValue {
  const value = use(LeftPanelContext)
  if (!value) {
    throw new Error("useLeftPanel must be used inside the Studio screen")
  }
  return value
}
