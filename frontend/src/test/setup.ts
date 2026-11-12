import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// jsdom has no layout, so it has neither of these.
Element.prototype.scrollIntoView ??= () => {}
if (!("CSS" in globalThis) || typeof CSS.escape !== "function") {
  Object.defineProperty(globalThis, "CSS", {
    value: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
    configurable: true,
  })
}

afterEach(cleanup)
