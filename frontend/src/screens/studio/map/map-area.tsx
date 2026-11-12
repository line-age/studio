import { Suspense, lazy } from "react"

import { ErrorBoundary } from "@/components/error-boundary"
import { Hint } from "@/components/hint"

/*
 * The map library is large, so it loads in its own chunk after the panels
 * are on screen.
 */
const StudioMap = lazy(() =>
  import("./studio-map").then((m) => ({ default: m.StudioMap }))
)

function mapboxToken(): string | null {
  const token: unknown = import.meta.env.VITE_MAPBOX_TOKEN
  return typeof token === "string" && token.length > 0 ? token : null
}

function Message({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col gap-1 rounded-lg border bg-background p-4 shadow-panel">
        <h2 className="type-ui-sm-semibold">{title}</h2>
        <Hint>{children}</Hint>
      </div>
    </div>
  )
}

export function MapArea() {
  const token = mapboxToken()
  if (!token) {
    return (
      <Message title="The map needs a Mapbox token">
        Put your public token in .env.local as VITE_MAPBOX_TOKEN and restart the
        dev server. The lists and panels work without it.
      </Message>
    )
  }
  return (
    <ErrorBoundary
      fallback={() => (
        <Message title="The map could not start">
          Check the Mapbox token and the network connection, then load the page
          again. The lists and panels still work.
        </Message>
      )}
    >
      <Suspense fallback={null}>
        <StudioMap token={token} />
      </Suspense>
    </ErrorBoundary>
  )
}
