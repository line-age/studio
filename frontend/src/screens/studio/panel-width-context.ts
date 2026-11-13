import { createContext, use } from "react"

/*
 * How wide a side panel is right now, for what is inside it: the list shows
 * more columns as its panel is made wider, and one button widens it into a
 * table and back.
 */
export interface PanelWidth {
  width: number
  /** The panel's own width, which is also the narrowest it goes. */
  min: number
  /** Wider than its own width. */
  wide: boolean
  /** Between the panel's own width and the last wide one. */
  toggleWide: () => void
}

export const PanelWidthContext = createContext<PanelWidth | null>(null)

/** Null outside a side panel: the content then lays out at its own width. */
export function usePanelWidth(): PanelWidth | null {
  return use(PanelWidthContext)
}
