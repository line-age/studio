import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { AddToAgentMenu } from "./add-to-agent"
import { LeftPanelContext } from "./left-panel-context"

function renderMenu(items: Parameters<typeof AddToAgentMenu>[0]["items"]) {
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
      <AddToAgentMenu items={items}>
        <div>Target</div>
      </AddToAgentMenu>
    </LeftPanelContext>
  )
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
      await screen.findByRole("menuitem", { name: "Add to the Agent chat" })
    ).toBeInTheDocument()
  })
})
