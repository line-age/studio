import { createContext, use } from "react"

import type { Session } from "./session"

/*
 * Who is using Studio, for anything inside the screen that shows it (the
 * account button in the top bar). SessionGate provides it; with nothing
 * above, as in a test of one panel, there is nobody to show.
 */
export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session | null {
  return use(SessionContext)
}
