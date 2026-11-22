import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { LoadBar } from "@/components/load-bar"
import { dataSource } from "@/data/load-network"
import { SessionContext } from "@/data/session-context"
import {
  currentView,
  isSignedOut,
  loadSession,
  signInHasEnded,
  signInReturn,
  subscribeSignInEnded,
  type Session,
} from "@/data/session"

import { SignInAgain } from "./sign-in-again"
import { SignInScreen } from "./sign-in-screen"

/*
 * What decides whether Studio opens. On the sample it always does. On
 * store's data it asks who is using it first: signed in (or, locally, Local
 * developer) opens Studio; anything else is the sign-in page, so nothing of
 * store's shows before a sign-in. A sign-in ending while signed in (a 401,
 * or a read refused with 403) raises "Sign in again" over the screen. Locally
 * there is no gate to sign in again through, so a refusal there shows only
 * where the request failed.
 */
export function SessionGate({
  children,
  load = () => loadSession(dataSource()),
}: {
  children: ReactNode
  /** Who is using Studio. Tests pass their own. */
  load?: () => Promise<Session>
}) {
  // Known at once, with nobody to ask: the sample, and what the gate said in
  // the address after a sign-in that did not end in a session.
  const [session, setSession] = useState<Session | null>(() =>
    dataSource() === "fixture"
      ? { kind: "sample" }
      : signInReturn(window.location.search)
  )
  const ended = useSyncExternalStore(subscribeSignInEnded, signInHasEnded)

  // Once read, the gate's words leave the address; the view stays.
  useEffect(() => {
    if (signInReturn(window.location.search)) {
      window.history.replaceState(null, "", currentView())
    }
  }, [])

  useEffect(() => {
    if (session) return
    let live = true
    // load() never throws: a gate that does not answer is a session too.
    void load().then((found) => live && setSession(found))
    return () => {
      live = false
    }
    // Asked once, when Studio opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!session) {
    return (
      <div className="relative h-svh">
        <LoadBar loading />
      </div>
    )
  }
  if (isSignedOut(session)) return <SignInScreen session={session} />
  return (
    <SessionContext value={session}>
      {children}
      <SignInAgain open={ended && session.kind === "signed-in"} />
    </SessionContext>
  )
}
