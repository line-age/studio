import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MapArea } from "./map-area"

afterEach(() => vi.unstubAllEnvs())

describe("the map area", () => {
  it("says what is missing when there is no Mapbox token", () => {
    vi.stubEnv("VITE_MAPBOX_TOKEN", "")
    render(<MapArea />)
    expect(
      screen.getByRole("heading", { name: "The map needs a Mapbox token" })
    ).toBeVisible()
    expect(screen.getByText(/lists and panels work without it/)).toBeVisible()
  })
})
