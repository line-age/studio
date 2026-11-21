import { StrictMode } from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Session } from "@/data/session"
import { studioFetch } from "@/data/session"

import { SessionGate } from "./session-gate"
import { SignInAgain } from "./sign-in-again"
import { SignInScreen } from "./sign-in-screen"

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, "", "/")
})

const gate = (session: Session) =>
  render(
    <SessionGate load={() => Promise.resolve(session)}>
      <p>The Studio screen</p>
    </SessionGate>
  )

describe("SessionGate", () => {
  it("opens Studio on the sample without asking anybody", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(
      <SessionGate>
        <p>The Studio screen</p>
      </SessionGate>
    )
    expect(screen.getByText("The Studio screen")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows only the sign-in page to a person signed out", async () => {
    gate({ kind: "signed-out" })
    expect(
      await screen.findByRole("heading", { name: "Sign in to Lineage Studio" })
    ).toBeInTheDocument()
    expect(screen.queryByText("The Studio screen")).not.toBeInTheDocument()
  })

  it("opens Studio for a person signed in", async () => {
    gate({ kind: "signed-in", name: "Ada Example", login: "a", chat: "c" })
    expect(await screen.findByText("The Studio screen")).toBeInTheDocument()
  })

  it("opens Studio for Local developer", async () => {
    gate({ kind: "local" })
    expect(await screen.findByText("The Studio screen")).toBeInTheDocument()
  })

  it("asks to sign in again over the screen when store answers 401", async () => {
    gate({ kind: "signed-in", name: "Ada Example", login: "a", chat: "c" })
    await screen.findByText("The Studio screen")
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("", { status: 401 }))
    )
    await act(() => studioFetch("/store/sections"))
    expect(
      await screen.findByRole("dialog", { name: "Sign in again" })
    ).toHaveAccessibleDescription(
      "Your sign-in ended. The map and what you selected stay as they are behind this window."
    )
    expect(screen.getByText("The Studio screen")).toBeInTheDocument()
  })
})

describe("SignInScreen", () => {
  it("leaves for GitHub and back to the same view, saying it is signing in", async () => {
    window.history.replaceState(null, "", "/?sc=pipelines")
    const go = vi.fn()
    render(<SignInScreen session={{ kind: "signed-out" }} go={go} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with GitHub" })
    )
    expect(go).toHaveBeenCalledWith("/auth/login?next=%2F%3Fsc%3Dpipelines")
    expect(
      screen.getByRole("heading", { name: "Signing in" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" })
    ).toBeDisabled()
  })

  it("says which account is in no team, and offers another", async () => {
    const go = vi.fn()
    render(
      <SignInScreen
        session={{ kind: "not-in-team", login: "ada-example" }}
        go={go}
      />
    )
    expect(
      screen.getByRole("heading", { name: "You don't have access yet" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Signed in to GitHub as ada-example\./)
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Use another GitHub account" })
    )
    expect(go).toHaveBeenCalledWith("/auth/login?next=%2F&account=choose")
  })

  it("tries the same account again", async () => {
    const go = vi.fn()
    render(
      <SignInScreen
        session={{ kind: "not-in-team", login: "ada-example" }}
        go={go}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(go).toHaveBeenCalledWith("/auth/login?next=%2F")
  })

  it("says GitHub did not answer, and that nothing changed", () => {
    render(<SignInScreen session={{ kind: "signed-out", failure: "github" }} />)
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not sign in: GitHub did not answer. Nothing was changed."
    )
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled()
  })

  it("says when Studio's own sign-in did not answer", () => {
    render(
      <SignInScreen session={{ kind: "signed-out", failure: "unreachable" }} />
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Studio's sign-in did not answer"
    )
  })
})

describe("SignInAgain", () => {
  it("signs in again and comes back to the same view", async () => {
    window.history.replaceState(null, "", "/?sel=s-1")
    const go = vi.fn()
    render(<SignInAgain open go={go} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Sign in with GitHub" })
    )
    expect(go).toHaveBeenCalledWith("/auth/login?next=%2F%3Fsel%3Ds-1")
  })

  it("cannot be closed with Escape", async () => {
    render(<SignInAgain open />)
    await userEvent.keyboard("{Escape}")
    expect(
      screen.getByRole("dialog", { name: "Sign in again" })
    ).toBeInTheDocument()
  })
})

describe("Coming back from the gate", () => {
  it("names the account in no team, and keeps the view without the gate's words", async () => {
    window.history.replaceState(
      null,
      "",
      "/?sc=all&sign_in=not_in_team&login=ada-example"
    )
    vi.stubEnv("VITE_DATA_SOURCE", "store")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(
      <StrictMode>
        <SessionGate>
          <p>The Studio screen</p>
        </SessionGate>
      </StrictMode>
    )
    expect(
      screen.getByRole("heading", { name: "You don't have access yet" })
    ).toBeInTheDocument()
    expect(window.location.search).toBe("?sc=all")
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
