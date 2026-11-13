import { create } from "zustand"

import { HELP_STEPS } from "./steps"

/*
 * Help: the tour that walks the screen area by area, and the Help dialog.
 * Whether this browser has seen the tour is kept in the browser, like
 * Settings; the tour starts by itself only until then.
 */

export const TOUR_SEEN_KEY = "studio.tour-seen"

/** The Help button: where the keyboard goes back to when the tour ends. */
export const HELP_BUTTON_ID = "studio-help"

function readSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) !== null
  } catch {
    // Storage blocked: do not start a tour that cannot be remembered as seen.
    return true
  }
}

function writeSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1")
  } catch {
    // Storage blocked or full: seen holds for this visit only.
  }
}

interface HelpState {
  /** This browser has had the tour, to the end or skipped. */
  seen: boolean
  /** The step the tour is on; null when no tour runs. */
  step: number | null
  /** Which way the person last moved, so a step with no area is passed over. */
  direction: 1 | -1
  dialogOpen: boolean
  /** Run the tour, from the first step unless told another. */
  start: (at?: number) => void
  next: () => void
  back: () => void
  /** Done, Skip or Escape: the tour ends and counts as seen. */
  end: () => void
  setDialogOpen: (open: boolean) => void
}

export const useHelp = create<HelpState>((set) => ({
  seen: readSeen(),
  step: null,
  direction: 1,
  dialogOpen: false,
  start: (at = 0) =>
    set({
      step: Math.min(Math.max(at, 0), HELP_STEPS.length - 1),
      direction: 1,
      dialogOpen: false,
    }),
  next: () =>
    set((s) => {
      if (s.step === null) return s
      if (s.step >= HELP_STEPS.length - 1) {
        writeSeen()
        return { step: null, seen: true }
      }
      return { step: s.step + 1, direction: 1 }
    }),
  back: () =>
    set((s) =>
      s.step === null || s.step === 0 ? s : { step: s.step - 1, direction: -1 }
    ),
  end: () => {
    writeSeen()
    set({ step: null, seen: true })
  },
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}))
