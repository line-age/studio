import { afterEach, describe, expect, it, vi } from "vitest"

import {
  forgetSignInEnded,
  initialSession,
  loadSession,
  signInHasEnded,
  signInReturn,
  signInUrl,
  signOut,
  studioFetch,
  subscribeSignInEnded,
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

const person = { name: "Ada Example", login: "ada-example" }

afterEach(() => {
  forgetSignInEnded()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState(null, "", "/")
})

describe("loadSession", () => {
  it("is the person the gate names", async () => {
    const fetchMock = answer(() => json(person))
    expect(await loadSession()).toEqual({
      kind: "signed-in",
      ...person,
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe("/auth/me")
  })

  it("is signed out when the gate has no session", async () => {
    answer(() => json({}, 401))
    expect(await loadSession()).toEqual({ kind: "signed-out" })
  })

  it("says the sign-in did not answer when the gate is not there", async () => {
    // nginx and Vite answer an unknown path with the app shell.
    answer(() => new Response("<!doctype html>", { status: 200 }))
    expect(await loadSession()).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
    answer(() => Promise.reject(new TypeError("offline")))
    expect(await loadSession()).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
    answer(() => json({}, 502))
    expect(await loadSession()).toEqual({
      kind: "signed-out",
      failure: "unreachable",
    })
  })

  describe("working locally", () => {
    it("is Local developer when store takes the local token", async () => {
      vi.stubEnv("VITE_AUTH", "local")
      const fetchMock = answer(() => json({ kind: "person" }))
      expect(await loadSession()).toEqual({ kind: "local" })
      expect(String(fetchMock.mock.calls[0][0])).toBe("/store/me")
    })

    it("is signed out when store refuses", async () => {
      vi.stubEnv("VITE_AUTH", "local")
      answer(() => json({}, 401))
      expect(await loadSession()).toEqual({
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

  it("never hands the gate a path a browser reads as another site", () => {
    for (const path of ["//elsewhere.test/x", "/\\elsewhere.test/x"]) {
      window.history.replaceState(null, "", window.location.origin + path)
      expect(
        window.location.pathname.startsWith("//") ||
          window.location.pathname.startsWith("/\\")
      ).toBe(true)
      expect(signInUrl()).toBe("/auth/login?next=%2F")
    }
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
    await studioFetch("/store/x", {
      headers: new Headers({ Accept: "application/json" }),
    })
    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(sent.get("Accept")).toBe("application/json")
    expect(sent.get("X-Studio")).toBe("1")
  })

  it("keeps a 401 as the sign-in ending, and still hands back the 401", async () => {
    answer(() => json({}, 401))
    const heard = vi.fn()
    const stop = subscribeSignInEnded(heard)
    const response = await studioFetch("/store/x")
    await studioFetch("/store/y")
    stop()
    expect(response.status).toBe(401)
    expect(signInHasEnded()).toBe(true)
    expect(heard).toHaveBeenCalledOnce()
  })

  it("takes a 403 on a read as the sign-in ending: out of the team", async () => {
    answer(() => json({}, 403))
    await studioFetch("/store/x")
    expect(signInHasEnded()).toBe(true)
  })

  it("leaves a 403 on a write to the write: it may refuse what was asked", async () => {
    answer(() => json({}, 403))
    await studioFetch("/store/bundles", { method: "POST" })
    expect(signInHasEnded()).toBe(false)
  })

  it("does not take other errors as the sign-in ending", async () => {
    answer(() => json({}, 500))
    await studioFetch("/store/x")
    expect(signInHasEnded()).toBe(false)
  })
})

describe("initialSession", () => {
  it("is the sample on the sample, whatever the address says", () => {
    expect(initialSession("fixture", "?sign_in=failed")).toEqual({
      kind: "sample",
    })
  })

  it("is what the gate said on store's data, or nothing yet", () => {
    expect(initialSession("store", "?sign_in=failed")).toEqual({
      kind: "signed-out",
      failure: "github",
    })
    expect(initialSession("store", "")).toBeNull()
  })
})

describe("signOut", () => {
  it("asks the gate to end the session, as Studio, then loads the same view in place", async () => {
    at("/?sc=pipelines")
    const fetchMock = answer(() => new Response(null, { status: 204 }))
    const go = vi.fn()
    expect(await signOut(go)).toBe(true)
    const [path, init] = fetchMock.mock.calls[0]
    expect(String(path)).toBe("/auth/logout")
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("X-Studio")).toBe("1")
    expect(go).toHaveBeenCalledWith("/?sc=pipelines")
  })

  it("is signed out already when the session had ended", async () => {
    answer(() => json({}, 401))
    const go = vi.fn()
    expect(await signOut(go)).toBe(true)
    expect(go).toHaveBeenCalledOnce()
    expect(signInHasEnded()).toBe(false)
  })

  it("stays put and says so when the gate does not answer or fails", async () => {
    const go = vi.fn()
    answer(() => Promise.reject(new TypeError("offline")))
    expect(await signOut(go)).toBe(false)
    answer(() => json({}, 502))
    expect(await signOut(go)).toBe(false)
    expect(go).not.toHaveBeenCalled()
  })

  it("does not take what is refused while leaving as the sign-in ending", async () => {
    let finish: (r: Response) => void = () => {}
    answer((path) =>
      path === "/auth/logout"
        ? new Promise<Response>((resolve) => (finish = resolve))
        : json({}, 401)
    )
    const leaving = signOut(vi.fn())
    await studioFetch("/store/x")
    expect(signInHasEnded()).toBe(false)
    finish(new Response(null, { status: 204 }))
    await leaving
  })

  it("asks the gate once, however often it is pressed", async () => {
    const fetchMock = answer(() => new Response(null, { status: 204 }))
    await Promise.all([signOut(vi.fn()), signOut(vi.fn())])
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
