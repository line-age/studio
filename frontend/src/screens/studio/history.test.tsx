import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { withClaims, type Network } from "@/data/schema"
import { evidenceNetwork } from "@/test/network"

import { useSettings } from "./settings"
import { StudioScreen } from "./studio-screen"
import { useCamera, useStudio } from "./studio-store"

/*
 * A section's history: a claim it has through a confirmed link (here a line
 * traced as gone that a person matched to it) is shown with where it comes
 * from, never as the section's own. The section stays its own record.
 */

const GONE = "aaaa1111-0000-4000-8000-000000000001"

function withHistory(): Network {
  const network = evidenceNetwork()
  return {
    ...network,
    sections: network.sections.map((s) =>
      s.id !== "s-6"
        ? s
        : withClaims(s, [
            ...s.claims!,
            {
              attribute: "Status",
              value: "Shown by June 1931; decommissioned",
              citations: [
                {
                  source: "Invented trunk map, 1931",
                  role: "map_shows",
                  asOf: "1931-06",
                },
                {
                  source: "Invented trunk map, 1937",
                  role: "map_omits",
                  asOf: "1937",
                  inheritedFrom: GONE,
                },
              ],
              proposals: [],
            },
          ])
    ),
  }
}

vi.mock("@/data/load-network", async (original) => ({
  ...(await original<typeof import("@/data/load-network")>()),
  loadNetwork: () => Promise.resolve(withHistory()),
}))
vi.mock("./map/map-area", () => ({ MapArea: () => null }))

beforeEach(() => {
  localStorage.clear()
  useSettings.getState().reset()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

describe("a claim from a section's history", () => {
  it("names the feature it comes from, in the panel", async () => {
    await act(async () => {
      render(<StudioScreen />)
    })
    const user = userEvent.setup()
    await user.type(
      screen.getByRole("combobox", { name: "Search name or code" }),
      "fir to{Enter}"
    )
    const claims = screen.getByRole("group", { name: "Claims of Fir to Gale" })
    const row = within(claims)
      .getAllByRole("treeitem")
      .find((item) => item.textContent?.startsWith("Status"))!
    await user.click(row)
    const detail = screen.getByRole("region", { name: "Status of Fir to Gale" })
    expect(detail).toHaveTextContent(
      "which a person linked to this section: its history. Each stays its own record."
    )
    const sources = within(detail).getByRole("list", { name: "Sources" })
    const [own, inherited] = within(sources).getAllByRole("button")
    expect(own).not.toHaveTextContent("from")
    expect(inherited).toHaveTextContent(/Not on, from \S+/)
  })
})
