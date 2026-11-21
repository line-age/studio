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
  | { kind: "signed-in"; name: string; login: string; chat: string }
  | { kind: "signed-out"; failure?: SignInFailure }
  | { kind: "not-in-team"; login: string }

/** Why the last sign-in did not work: GitHub, or the gate itself. */
export type SignInFailure = "github" | "unreachable"

export type AuthMode = "gate" | "local"

export function authMode(): AuthMode {
  return import.meta.env.VITE_AUTH === "local" ? "local" : "gate"
}

const person = z.object({
  name: z.string().min(1),
  login: z.string().min(1),
  chat: z.string().min(1),
})

/** The query keys the gate sends back after a sign-in; read once, then removed. */
const SIGN_IN_KEYS = ["sign_in", "login"] as const

/**
 * What the gate said about the last sign-in, if it came back with words.
 * Pure: the caller removes the words from the address once it has them.
 */
export function signInReturn(search: string): Session | null {
  const query = new URLSearchParams(search)
  const said = query.get("sign_in")
  const login = query.get("login")
  if (said === "not_in_team" && login) return { kind: "not-in-team", login }
  if (said === "failed") return { kind: "signed-out", failure: "github" }
  return null
}

/** The path and query a person is on, without what the gate added. */
export function currentView(location: Location = window.location): string {
  const query = new URLSearchParams(location.search)
  for (const key of SIGN_IN_KEYS) query.delete(key)
  const rest = query.toString()
  return `${location.pathname}${rest ? `?${rest}` : ""}`
}

/** Where "Sign in with GitHub" goes: GitHub, then back to this same view. */
export function signInUrl(options: { chooseAccount?: boolean } = {}): string {
  const query = new URLSearchParams({ next: currentView() })
  if (options.chooseAccount) query.set("account", "choose")
  return `/auth/login?${query.toString()}`
}

/** Who is using Studio. Never throws: a gate that does not answer is a failure. */
export async function loadSession(source: DataSource): Promise<Session> {
  if (source === "fixture") return { kind: "sample" }
  const local = authMode() === "local"
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

type Listener = () => void
const listeners = new Set<Listener>()

/** Calls back when a request is refused because the sign-in ended. */
export function onSignInEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * fetch for Studio's own /store: says the request comes from Studio (the gate
 * refuses a write without it), and reports a 401 as the sign-in ending. The
 * caller still sees the 401 and fails as it always did, so nothing that was
 * refused is shown as done.
 */
export async function studioFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-Studio": "1" },
  })
  if (response.status === 401) for (const listener of listeners) listener()
  return response
}
