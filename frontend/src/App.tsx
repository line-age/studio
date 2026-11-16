import { Toaster } from "@/components/ui/sonner"
import { StudioScreen } from "@/screens/studio/studio-screen"

/** One screen for now. More screens get their own directory under screens/. */
export function App() {
  return (
    <>
      <StudioScreen />
      <Toaster />
    </>
  )
}

export default App
