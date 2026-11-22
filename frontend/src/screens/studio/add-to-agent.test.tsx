import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AddToAgentMenu, type EditTarget } from "./add-to-agent"
import { LeftPanelContext } from "./left-panel-context"

function renderMenu(
  items: Parameters<typeof AddToAgentMenu>[0]["items"],
  edit?: EditTarget
) {
  render(
    <LeftPanelContext
      value={{
        panel: "pipelines",
        open: true,
        openPanel: () => {},
        togglePanel: () => {},
        toggleOpen: () => {},
      }}
    >
      <AddToAgentMenu items={items} edit={edit}>
        <div>Target</div>
      </AddToAgentMenu>
    </LeftPanelContext>
  )
}

async function openMenu() {
  const user = userEvent.setup()
  await user.pointer({
    keys: "[MouseRight]",
    target: screen.getByText("Target"),
  })
  return user
}

describe("Add to the Agent chat", () => {
  it("opens no menu when there is nothing to add", async () => {
    const user = userEvent.setup()
    await act(async () => renderMenu([]))
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Target"),
    })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("offers the items when there are some", async () => {
    const user = userEvent.setup()
    await act(async () =>
      renderMenu([{ pipelineId: "p-1", sectionIds: "all" }])
    )
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Target"),
    })
    expect(
      await screen.findByRole("menuitem", { name: "Ask" })
    ).toBeInTheDocument()
  })
})

describe("the Edit items on a section row", () => {
  it("offers only Edit and Ask when the row is on its own", async () => {
    await act(async () =>
      renderMenu([], {
        name: "Alder to Birch",
        onEditOne: vi.fn(),
        count: 1,
        onEditAll: vi.fn(),
      })
    )
    await openMenu()
    expect(
      await screen
        .findAllByRole("menuitem")
        .then((items) => items.map((i) => i.textContent))
    ).toEqual(["Edit", "Ask"])
    expect(screen.queryByText(/sections selected/)).not.toBeInTheDocument()
  })

  it("adds Edit selected, with a count and a header, when more rows are ticked", async () => {
    const onEditOne = vi.fn()
    const onEditAll = vi.fn()
    await act(async () =>
      renderMenu([], {
        name: "Alder to Birch",
        onEditOne,
        count: 2,
        onEditAll,
      })
    )
    const user = await openMenu()
    expect(screen.getByText("2 sections selected")).toBeInTheDocument()
    expect(
      await screen
        .findAllByRole("menuitem")
        .then((items) => items.map((i) => i.textContent))
    ).toEqual(["Edit", "Edit selected (2)", "Ask"])

    await user.click(
      screen.getByRole("menuitem", { name: "Edit selected (2)" })
    )
    expect(onEditAll).toHaveBeenCalled()
    expect(onEditOne).not.toHaveBeenCalled()
  })
})
