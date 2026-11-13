import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"

import { useHelp } from "@/screens/studio/help/help-store"

// jsdom has no layout, so it has neither of these.
Element.prototype.scrollIntoView ??= () => {}
if (!("CSS" in globalThis) || typeof CSS.escape !== "function") {
  Object.defineProperty(globalThis, "CSS", {
    value: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
    configurable: true,
  })
}

// The Help tour starts by itself on a first visit and covers the screen.
// Tests run as someone who has seen it; a tour test says otherwise.
beforeEach(() => {
  useHelp.setState({ ...useHelp.getInitialState(), seen: true }, true)
})

afterEach(cleanup)
