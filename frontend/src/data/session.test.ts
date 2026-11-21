import { afterEach, describe, expect, it, vi } from "vitest"

import {
  loadSession,
  onSignInEnded,
  signInReturn,
  signInUrl,
  studioFetch,
} from "./session"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function answer(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >((input) => Promise.resolve(handler(String(input))))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** A place as the browser has it: just what the session reads. */
const at = (path: string) => {
  const url = new URL(path, "http://studio.test")
  window.history.replaceState(null, "", url.pathname + url.search)
  return window.location
}

const person = { name: "Ada Example", login: "ada-example", chat: "c-1" }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState(null, "", "/")
})

describe("loadSession", () => {
  it("asks nobody on the sample", async () => {
    const fetchMock = answer(() => json(person))
    expect(await loadSession("fixture")).toEqual({ kind: "sample" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("is the person the gate names", async () => {
    const fetchMock = answer(() => json(person))
    expect(await loadSession("store")).toEqual({
      kind: "signed-in",
      ...person,
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe("/auth/me")
  })

  it("is signed out when the gate has no session", async () => {
    answer(() => json({}, 401))
    expect(await loadSession("store")).toEqual({ kind: "signed-out" })
  })

  it("says the sign-in did not answer when the gate is not there", async () => {
    // nginx and Vite answer an unknown path with the app shell.
    answer(() => new Response("<!doctype html>", { status: 200 }))
    expect(await loadSession("store")).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
    answer(() => Promise.reject(new TypeError("offline")))
    expect(await loadSession("store")).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
    answer(() => json({}, 502))
    expect(await loadSession("store")).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
  })

  describe("working locally", () => {
    it("is Local developer when store takes the local token", async () => {
      vi.stubEnv("VITE_AUTH", "local")
      const fetchMock = answer(() => json({ kind: "person" }))
      expect(await loadSession("store")).toEqual({ kind: "local" })
      expect(String(fetchMock.mock.calls[0][0])).toBe("/store/me")
    })

    it("is signed out when store refuses", async () => {
      vi.stubEnv("VITE_AUTH", "local")
      answer(() => json({}, 401))
      expect(await loadSession("store")).toEqual({
        kind: "signed-out",
      })
    })
  })
})

describe("signInReturn", () => {
  it("names the account that is in no team", () => {
    expect(
      signInReturn("?sc=all&sign_in=not_in_team&login=ada-example")
    ).toEqual({ kind: "not-in-team", login: "ada-example" })
  })

  it("says GitHub did not answer when the gate came back failed", () => {
    expect(signInReturn("?sign_in=failed")).toEqual({
      kind: "signed-out",
      failure: "github",
    })
  })

  it("is nothing on a plain address, or one without the login", () => {
    expect(signInReturn("?sc=all")).toBeNull()
    expect(signInReturn("?sign_in=not_in_team")).toBeNull()
  })
})

describe("signInUrl", () => {
  it("comes back to the same view", () => {
    at("/?sc=pipelines&sel=s-1")
    expect(signInUrl()).toBe(
      "/auth/login?next=%2F%3Fsc%3Dpipelines%26sel%3Ds-1"
    )
  })

  it("asks GitHub which account when asked", () => {
    at("/")
    expect(signInUrl({ chooseAccount: true })).toBe(
      "/auth/login?next=%2F&account=choose"
    )
  })
})

describe("studioFetch", () => {
  it("says the request comes from Studio, keeping the caller's headers", async () => {
    const fetchMock = answer(() => json({}))
    await studioFetch("/store/x", { headers: { Accept: "application/json" } })
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Accept: "application/json",
      "X-Studio": "1",
    })
  })

  it("reports a 401 as the sign-in ending, and still hands back the 401", async () => {
    answer(() => json({}, 401))
    const ended = vi.fn()
    const stop = onSignInEnded(ended)
    const response = await studioFetch("/store/x")
    stop()
    expect(ended).toHaveBeenCalledOnce()
    expect(response.status).toBe(401)
  })

  it("does not report a refusal that is not a 401", async () => {
    answer(() => json({}, 403))
    const ended = vi.fn()
    const stop = onSignInEnded(ended)
    await studioFetch("/store/x")
    stop()
    expect(ended).not.toHaveBeenCalled()
  })
})
