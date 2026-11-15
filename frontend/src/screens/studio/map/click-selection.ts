/**
 * What a click on the map does to the selection. A plain click selects one
 * section; with the add key held, a click adds a section or takes it off.
 */

const onMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** The add key as the person knows it: Cmd on a Mac, Ctrl elsewhere. */
export const addKeyName = (mac = onMac()) => (mac ? "Cmd" : "Ctrl")

/**
 * Whether the add key is held. On a Mac Ctrl is not it: Ctrl and click is a
 * right click there, and Ctrl and drag turns the map.
 */
export const holdsAddKey = (
  event: { metaKey: boolean; ctrlKey: boolean },
  mac = onMac()
) => (mac ? event.metaKey : event.ctrlKey)

export type MapClick = "select-one" | "toggle" | "step-back" | "nothing"

export function mapClick(click: {
  /** The click landed on a section. */
  onSection: boolean
  addKey: boolean
  /** Nothing is selected yet. */
  empty: boolean
}): MapClick {
  if (!click.onSection) {
    // A miss with the key held must not cost the selection being built.
    return click.addKey ? "nothing" : "step-back"
  }
  // The first of a set opens like any single selection.
  return click.addKey && !click.empty ? "toggle" : "select-one"
}
