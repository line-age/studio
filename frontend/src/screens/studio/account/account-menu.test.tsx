import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { initials } from "./person-avatar"
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
  chat: "c",
}

describe("the account in the top bar", () => {
  it("shows who is signed in", () => {
    account(ada)
    expect(
      screen.getByRole("button", { name: "Account: Ada Example" })
    ).toHaveTextContent("Ada Example")
  })

  it("opens to the GitHub login and signs out on Sign out", async () => {
    const onSignOut = account(ada)
    await userEvent.click(screen.getByRole("button", { name: /Account/ }))
    expect(await screen.findByText("@ada-example")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it("names Local developer, with nothing to sign out of", async () => {
    account({ kind: "local" })
    await userEvent.click(
      screen.getByRole("button", { name: "Account: Local developer" })
    )
    expect(
      await screen.findByText("No sign-in on this machine")
    ).toBeInTheDocument()
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
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

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ada Example")).toBe("AE")
    expect(initials("ada mid example")).toBe("AE")
  })

  it("takes one letter from one word, and nothing from nothing", () => {
    expect(initials("ada")).toBe("A")
    expect(initials("  ")).toBe("")
  })
})
