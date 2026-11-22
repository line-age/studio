import { Toaster } from "@/components/ui/sonner"
import { SessionGate } from "@/screens/sign-in/session-gate"
import { StudioScreen } from "@/screens/studio/studio-screen"

/** One screen, behind sign-in on store's data. More screens get their own directory under screens/. */
export function App() {
  return (
    <>
      <SessionGate>
        <StudioScreen />
      </SessionGate>
      <Toaster />
    </>
  )
}

export default App
