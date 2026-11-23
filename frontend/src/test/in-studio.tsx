import { render } from "@testing-library/react"
import { Suspense, type ReactNode } from "react"
import { act } from "react"

import type { Network } from "@/data/schema"
import { StudioDataProvider } from "@/screens/studio/studio-data"

import { testNetwork } from "./network"

/**
 * Renders a panel part inside Studio's data provider, on the invented test
 * network (or `network`), as the screen holds it. Changes are made in memory,
 * as on the sample.
 */
export async function renderInStudio(
  ui: ReactNode,
  network: Network = testNetwork(),
  /** What a read just before a write finds: data changed elsewhere, or null. */
  readAgain?: () => Promise<Network | null>
) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <StudioDataProvider
          network={Promise.resolve(network)}
          source={readAgain ? "store" : "fixture"}
          readAgain={readAgain}
          reload={async () => true}
        >
          {ui}
        </StudioDataProvider>
      </Suspense>
    )
  })
  return result
}
