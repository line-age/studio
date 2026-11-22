import { z } from "zod"

import type { DataSource } from "./load-network"

/*
 * Who is using Studio, and the one place that hears a sign-in end.
 *
 * On store's data a person signs in with GitHub through the gate, a small
 * server beside Studio (plan 2026-11-21-003, section 2). The gate holds the
 * person's token; the browser holds only a session cookie it cannot read, so
 * nothing here ever sees a token. The gate answers:
 *
 * - `GET /auth/me`: the person, or 401 with no session.
 * - `/auth/login?next=<path>`: off to GitHub and back to that path. With
 *   `account=choose`, GitHub asks which account to use.
 * - after a sign-in that did not end in a session, back to Studio with
 *   `?sign_in=not_in_team&login=<login>` or `?sign_in=failed`.
 *
 * With VITE_AUTH=local (development and the local container only) there is no
 * gate: store is asked who this is, and the dev proxy or nginx sends a fixed
 * token that a store started with the fake GitHub takes as Local developer.
 * The sample needs no sign-in at all.
 */

export type Session =
  | { kind: "sample" }
  | { kind: "local" }
  | { kind: "signed-in"; name: string; login: string }
  | { kind: "signed-out"; failure?: SignInFailure }
  | { kind: "not-in-team"; login: string }

/** Why the last sign-in did not work: GitHub, or the gate itself. */
export type SignInFailure = "github" | "unreachable"

/** The sessions that show the sign-in page in place of Studio. */
export type SignedOut = Extract<
  Session,
  { kind: "signed-out" } | { kind: "not-in-team" }
>

export function isSignedOut(session: Session): session is SignedOut {
  return session.kind === "signed-out" || session.kind === "not-in-team"
}

const person = z.object({
  name: z.string().min(1),
  login: z.string().min(1),
})

/**
 * What the gate said about the last sign-in, if it came back with words.
 * Pure: the caller removes the words from the address once it has them.
 */
export function signInReturn(search: string): SignedOut | null {
  const query = new URLSearchParams(search)
  const said = query.get("sign_in")
  const login = query.get("login")
  if (said === "not_in_team" && login) return { kind: "not-in-team", login }
  if (said === "failed") return { kind: "signed-out", failure: "github" }
  return null
}

/**
 * The path and query a person is on, without what the gate added. A path
 * that a browser would read as another site (`//host`, `/\\host`) comes back
 * as the root: the gate checks `next` too, and this never hands it one.
 */
export function currentView(): string {
  const { pathname, search } = window.location
  const query = new URLSearchParams(search)
  // What the gate sent back after a sign-in; read once, then removed.
  query.delete("sign_in")
  query.delete("login")
  const rest = query.toString()
  const path = /^\/[/\\]/.test(pathname) ? "/" : pathname
  return `${path}${rest ? `?${rest}` : ""}`
}

/** Where "Sign in with GitHub" goes: GitHub, then back to this same view. */
export function signInUrl(options: { chooseAccount?: boolean } = {}): string {
  const query = new URLSearchParams({ next: currentView() })
  if (options.chooseAccount) query.set("account", "choose")
  return `/auth/login?${query.toString()}`
}

/** Set while signing out: what is refused meanwhile is not a sign-in ending. */
let leaving = false

/**
 * Signs out: the gate drops the session, then the page is loaded again in
 * place of this one (so Back cannot bring the signed-in page back) and comes
 * up on the sign-in page, on the same view. Says whether it worked: when the
 * gate does not answer, the person is still signed in and stays where they
 * were. A 401 means the session had already ended, which is signed out too.
 */
export async function signOut(
  /** Loads the page again. Tests pass their own. */
  go: (url: string) => void = (url) => window.location.replace(url)
): Promise<boolean> {
  if (leaving) return true
  leaving = true
  const done = await fetch("/auth/logout", {
    method: "POST",
    headers: { "X-Studio": "1" },
  }).then(
    (response) => response.ok || response.status === 401,
    () => false
  )
  if (!done) {
    leaving = false
    return false
  }
  go(currentView())
  return true
}

/**
 * Who is using Studio before anyone is asked: on the sample, nobody needs to
 * sign in; on store's data, what the gate said in the address after a
 * sign-in that did not end in a session, if anything.
 */
export function initialSession(
  source: DataSource,
  search: string
): Session | null {
  return source === "fixture" ? { kind: "sample" } : signInReturn(search)
}

/**
 * Who is using Studio on store's data. Never throws: a gate that does not
 * answer is a failure.
 */
export async function loadSession(): Promise<Session> {
  // Locally a 401 also lands on the sign-in page, whose button leads to a
  // gate that is not there: store is not on the fake GitHub, or the proxy
  // sends no token. Studio does not open either way (R15).
  const local = import.meta.env.VITE_AUTH === "local"
  let response: Response
  try {
    response = await fetch(local ? "/store/me" : "/auth/me", {
      headers: { Accept: "application/json" },
    })
  } catch {
    return { kind: "signed-out", failure: "unreachable" }
  }
  if (response.status === 401) return { kind: "signed-out" }
  if (!response.ok) return { kind: "signed-out", failure: "unreachable" }
  if (local) return { kind: "local" }
  // An unknown path gets the app shell from nginx and Vite, so a 200 that is
  // not the person is a gate that is not there.
  const json: unknown = await response.json().catch(() => null)
  const parsed = person.safeParse(json)
  if (!parsed.success) return { kind: "signed-out", failure: "unreachable" }
  return { kind: "signed-in", ...parsed.data }
}

/*
 * Whether a request was refused because the sign-in ended: a 401, or a 403 on
 * a read, which is store saying the person has left their team. A write can
 * be refused for what it asks (another agent's claim), so a 403 there stays
 * the write's own error. Kept here and not
 * in a component, so a 401 that comes back before any component listens (as
 * one can while Studio first loads) is never lost. Once ended, only a new
 * page load starts it again.
 */
let ended = false
const listeners = new Set<() => void>()

export function subscribeSignInEnded(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function signInHasEnded(): boolean {
  return ended
}

/** For tests: as after a new page load. */
export function forgetSignInEnded(): void {
  ended = false
  leaving = false
}

/**
 * fetch for Studio's own /store and /agent: adds `X-Studio: 1` (the gate
 * refuses a write without it) and records the sign-in ending (above). The
 * caller still sees the refusal, so nothing refused is shown as done. Takes
 * an address, not a Request: the method and headers are read from `init`.
 */
export async function studioFetch(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set("X-Studio", "1")
  const response = await fetch(input, { ...init, headers })
  const read = (init.method ?? "GET").toUpperCase() === "GET"
  const over = response.status === 401 || (response.status === 403 && read)
  if (over && !ended && !leaving) {
    ended = true
    for (const listener of listeners) listener()
  }
  return response
}
