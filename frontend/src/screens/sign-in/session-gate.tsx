import { useEffect, useState, type ReactNode } from "react"

import { LoadBar } from "@/components/load-bar"
import { dataSource } from "@/data/load-network"
import {
  currentView,
  loadSession,
  onSignInEnded,
  signInReturn,
  type Session,
} from "@/data/session"

import { SignInAgain } from "./sign-in-again"
import { SignInScreen } from "./sign-in-screen"

/*
 * What decides whether Studio opens. On the sample it always does. On
 * store's data it asks who is using it first: signed in (or, locally, Local
 * developer) opens Studio; anything else is the sign-in page, so nothing of
 * store's shows before a sign-in. A 401 while working raises "Sign in again"
 * over the screen.
 */
export function SessionGate({
  children,
  load,
}: {
  children: ReactNode
  /** Who is using Studio. Tests pass their own. */
  load?: () => Promise<Session>
}) {
  // Known at once, with nobody to ask: the sample, and what the gate said in
  // the address after a sign-in that did not end in a session.
  const [session, setSession] = useState<Session | null>(() => {
    if (load) return null
    if (dataSource() === "fixture") return { kind: "sample" }
    return signInReturn(window.location.search)
  })
  const [ended, setEnded] = useState(false)

  // Once read, the gate's words leave the address; the view stays.
  useEffect(() => {
    if (signInReturn(window.location.search)) {
      window.history.replaceState(null, "", currentView())
    }
  }, [])

  useEffect(() => {
    if (session) return
    let live = true
    void (load ?? (() => loadSession(dataSource())))().then(
      (found) => live && setSession(found)
    )
    return () => {
      live = false
    }
    // Asked once, when Studio opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signedIn = session?.kind === "signed-in"
  useEffect(() => {
    if (!signedIn) return
    return onSignInEnded(() => setEnded(true))
  }, [signedIn])

  if (!session) {
    return (
      <div className="relative h-svh">
        <LoadBar loading />
      </div>
    )
  }
  if (session.kind === "signed-out" || session.kind === "not-in-team") {
    return <SignInScreen session={session} />
  }
  return (
    <>
      {children}
      <SignInAgain open={ended} />
    </>
  )
}
