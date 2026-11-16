import { Suspense, useState } from "react"

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Network, Section } from "@/data/schema"
import { testNetwork } from "@/test/network"

import { StudioDataProvider } from "../studio-data"
import { EditSectionsDialog } from "./edit-sections-dialog"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

/* Invented sections only, from the shared test fixture; never real store data. */

function Harness({ initial }: { initial: Section[] }) {
  const [target, setTarget] = useState(initial)
  return (
    <EditSectionsDialog
      open={target.length > 0}
      onOpenChange={(open) => {
        if (!open) setTarget([])
      }}
      sections={target}
    />
  )
}

async function renderDialog(network: Network, sectionIds: string[]) {
  const sections = sectionIds.map((id) =>
    network.sections.find((s) => s.id === id)!
  )
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <StudioDataProvider network={Promise.resolve(network)} source="fixture">
          <Harness initial={sections} />
        </StudioDataProvider>
      </Suspense>
    )
  })
  return userEvent.setup()
}

describe("EditSectionsDialog", () => {
  it("prefills a single section's own fields and offers Save", async () => {
    await renderDialog(testNetwork(), ["s-1"])
    expect(
      screen.getByRole("heading", { name: "Edit section Alder to Birch" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Diameter")).toHaveValue("12 in")
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(screen.getByText("No changes yet")).toBeInTheDocument()
  })

  it("shows Mixed where several sections disagree, and offers Update N sections", async () => {
    await renderDialog(testNetwork(), ["s-1", "s-3"])
    expect(
      screen.getByRole("heading", { name: "Edit 2 sections" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Diameter")).toHaveValue("")
    expect(screen.getByLabelText("Diameter")).toHaveAttribute(
      "placeholder",
      "Mixed"
    )
    expect(screen.getAllByText("Mixed").length).toBeGreaterThan(0)
    expect(
      screen.getByRole("button", { name: "Update 2 sections" })
    ).toBeInTheDocument()
  })

  it("marks a changed field with a Reset, and Reset puts the old value back", async () => {
    const user = await renderDialog(testNetwork(), ["s-1"])
    const diameter = screen.getByLabelText("Diameter")
    await user.clear(diameter)
    await user.type(diameter, "14 in")
    expect(
      screen.getByRole("button", { name: "Reset Diameter" })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Will update Diameter on 1 section")
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset Diameter" }))
    expect(screen.getByLabelText("Diameter")).toHaveValue("12 in")
    expect(
      screen.queryByRole("button", { name: "Reset Diameter" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("No changes yet")).toBeInTheDocument()
  })

  it("says how many sections it updated, by count, even for one", async () => {
    const user = await renderDialog(testNetwork(), ["s-1"])
    const diameter = screen.getByLabelText("Diameter")
    await user.clear(diameter)
    await user.type(diameter, "14 in")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(toast).toHaveBeenCalledWith(
      "Updated Diameter on 1 section.",
      expect.anything()
    )
  })

  it("leaves a section out of the bulk edit, and can add it back", async () => {
    const user = await renderDialog(testNetwork(), ["s-1", "s-3"])
    await user.click(
      screen.getByRole("button", { name: "Leave out Dale to Elm" })
    )
    // Only Alder to Birch (12 in) remains active: no longer Mixed.
    expect(screen.getByLabelText("Diameter")).toHaveValue("12 in")

    await user.click(
      screen.getByRole("button", { name: "Add Dale to Elm back" })
    )
    expect(screen.getByLabelText("Diameter")).toHaveValue("")
    expect(screen.getByLabelText("Diameter")).toHaveAttribute(
      "placeholder",
      "Mixed"
    )
  })

  it("blocks saving when Last seen would be before First seen", async () => {
    const network = testNetwork()
    const dated: Network = {
      ...network,
      sections: network.sections.map((s) =>
        s.id === "s-1"
          ? {
              ...s,
              claims: [
                ...s.claims,
                {
                  attribute: "First seen",
                  value: "1940",
                  citations: [{ source: "1937 edition" }],
                  proposals: [],
                },
                {
                  attribute: "Last seen",
                  value: "1930",
                  citations: [{ source: "1937 edition" }],
                  proposals: [],
                },
              ],
            }
          : s
      ),
    }
    await renderDialog(dated, ["s-1"])
    expect(
      screen.getByText("Last seen cannot be before First seen.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  describe("on the store", () => {
    it("blocks clearing Diameter rather than saving a clear the store cannot keep", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      vi.stubEnv("VITE_DATA_SOURCE", "store")
      const user = await renderDialog(testNetwork(), ["s-1"])
      await user.clear(screen.getByLabelText("Diameter"))
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(toast.error).toHaveBeenCalledWith(
        "Studio cannot clear Diameter on the store yet."
      )
      expect(toast).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not offer Undo on a store save", async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(json({ ids: {}, created: {} }))
      )
      vi.stubGlobal("fetch", fetchMock)
      vi.stubEnv("VITE_DATA_SOURCE", "store")
      const user = await renderDialog(testNetwork(), ["s-1"])
      const diameter = screen.getByLabelText("Diameter")
      await user.clear(diameter)
      await user.type(diameter, "14 in")
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(toast).toHaveBeenCalledTimes(1)
      expect(toast.mock.calls[0][1]).toBeUndefined()
    })

    it("disables a field store cannot keep, with a Not editable yet hint", async () => {
      vi.stubEnv("VITE_DATA_SOURCE", "store")
      await renderDialog(testNetwork(), ["s-1"])
      expect(screen.getByLabelText("Build date")).toBeDisabled()
      expect(screen.getByText("Not editable yet")).toBeInTheDocument()
      expect(
        screen.queryByText("Studio cannot save dates to store yet.")
      ).not.toBeInTheDocument()
    })
  })
})
