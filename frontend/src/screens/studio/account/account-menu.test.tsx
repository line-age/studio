import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Session } from "@/data/session"
import { SessionContext } from "@/data/session-context"

import { AccountMenu } from "./account-menu"

function account(session: Session | null, onSignOut = vi.fn()) {
  render(
    <SessionContext value={session}>
      <AccountMenu onSignOut={onSignOut} />
    </SessionContext>
  )
  return onSignOut
}

const ada: Session = {
  kind: "signed-in",
  name: "Ada Example",
  login: "ada-example",
}

describe("the account in the top bar", () => {
  it("shows who is signed in", () => {
    account(ada)
    expect(
      screen.getByRole("button", { name: "Account: Ada Example" })
    ).toHaveTextContent("Ada Example")
  })

  // What the open menu shows is in its stories; here, what Sign out does.
  it("signs out on Sign out", async () => {
    const onSignOut = account(ada)
    await userEvent.click(screen.getByRole("button", { name: /Account/ }))
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out" })
    )
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it("shows nobody on the sample", () => {
    account({ kind: "sample" })
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows nobody with no session above it", () => {
    account(null)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
