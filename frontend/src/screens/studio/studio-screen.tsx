import {
  Suspense,
  ViewTransition,
  startTransition,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { ErrorBoundary } from "@/components/error-boundary"
import { Hint } from "@/components/hint"
import { LoadBar } from "@/components/load-bar"
import { PanelHeader } from "@/components/panel-header"
import { RailItem } from "@/components/rail-item"
import { ResizeHandle } from "@/components/resize-handle"
import { Button } from "@/components/ui/button"
import { matchesShow } from "@/data/derive"
import { fixtureUrl, loadNetwork } from "@/data/load-network"
import { FixtureError } from "@/data/schema"

import { LeftPanelContext, useLeftPanel } from "./left-panel-context"
import { MapArea } from "./map/map-area"
import { AgentPanel } from "./panels/agent-panel"
import { FiltersPanel } from "./panels/filters-panel"
import { PipelinesPanel, SEARCH_INPUT_ID } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { StudioDataProvider, useStudioData } from "./studio-data"
import { useStudio, type LeftPanel } from "./studio-store"
import { TopBar } from "./top-bar"

/*
 * Studio: the map desk. Top bar, rail, one left panel (Pipelines, Filters or
 * Agent), the map, and the properties of what is selected. Read-only: it
 * shows the network and what the AI proposes; nothing can be changed here yet.
 */
export function StudioScreen() {
  const [network] = useState(() => loadNetwork())
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<LeftPanel>("pipelines")

  useEffect(() => {
    let current = true
    const done = () => {
      if (current) setLoading(false)
    }
    network.then(done, done)
    return () => {
      current = false
    }
  }, [network])

  const leftPanel = useMemo(
    () => ({
      panel,
      openPanel: (next: LeftPanel) => startTransition(() => setPanel(next)),
    }),
    [panel]
  )

  // "/" jumps to the pipeline search from anywhere outside a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable]")) return
      event.preventDefault()
      setPanel("pipelines")
      requestAnimationFrame(() =>
        document.getElementById(SEARCH_INPUT_ID)?.focus()
      )
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <LeftPanelContext value={leftPanel}>
      <div className="relative flex h-svh flex-col overflow-hidden">
        <LoadBar loading={loading} />
        <ErrorBoundary
          fallback={(error) => (
            <Frame>
              <LoadError error={error} />
            </Frame>
          )}
        >
          <Suspense fallback={<Frame busy />}>
            <StudioDataProvider network={network}>
              <Loaded />
            </StudioDataProvider>
          </Suspense>
        </ErrorBoundary>
      </div>
    </LeftPanelContext>
  )
}

/** The screen's frame. Used empty while loading and around a load error. */
function Frame({
  networkName,
  agentWaiting = false,
  left,
  right,
  busy = false,
  children,
}: {
  networkName?: string
  /** The Agent has proposals the person has not decided on. */
  agentWaiting?: boolean
  left?: ReactNode
  right?: ReactNode
  busy?: boolean
  /** The centre: the map, or a message. */
  children?: ReactNode
}) {
  const { panel, openPanel } = useLeftPanel()
  const leftWidth = usePanelWidth(
    "studio.left-panel-width",
    "--layout-panel-left"
  )
  const rightWidth = usePanelWidth(
    "studio.right-panel-width",
    "--layout-panel-right"
  )
  // Applied means different from how the screen opens (see clearFilters).
  const filtersApplied = useStudio((s) => s.show !== "all" || !s.onlyInView)
  return (
    <>
      <TopBar networkName={networkName} />
      <div className="flex min-h-0 flex-1" aria-busy={busy}>
        <nav
          aria-label="Panels"
          className="flex w-rail shrink-0 flex-col gap-1 border-r bg-muted py-2"
        >
          <RailItem
            icon="line"
            label="Pipelines"
            active={panel === "pipelines"}
            onClick={() => openPanel("pipelines")}
          />
          <RailItem
            icon="filter"
            label="Filters"
            indicator={filtersApplied ? { label: "filters applied" } : null}
            active={panel === "filters"}
            onClick={() => openPanel("filters")}
          />
          <RailItem
            icon="ask"
            label="Agent"
            indicator={
              agentWaiting ? { label: "waiting for you", tone: "ai" } : null
            }
            active={panel === "agent"}
            onClick={() => openPanel("agent")}
          />
        </nav>
        <aside
          aria-label={panel}
          style={
            leftWidth.width === null ? undefined : { width: leftWidth.width }
          }
          className="relative flex w-panel-left shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        >
          {left}
          <ResizeHandle
            label="Left panel width"
            width={leftWidth.width ?? leftWidth.min}
            min={leftWidth.min}
            max={leftWidth.max()}
            onResize={leftWidth.setWidth}
            onReset={() => leftWidth.setWidth(null)}
          />
        </aside>
        <main
          id="map"
          tabIndex={-1}
          aria-label="Map"
          className="relative min-w-0 flex-1 bg-map-basemap outline-none"
        >
          {children}
        </main>
        <aside
          aria-label="Properties"
          style={
            rightWidth.width === null ? undefined : { width: rightWidth.width }
          }
          className="relative flex w-panel-right shrink-0 flex-col border-l bg-background"
        >
          <ResizeHandle
            edge="left"
            label="Right panel width"
            width={rightWidth.width ?? rightWidth.min}
            min={rightWidth.min}
            max={rightWidth.max()}
            onResize={rightWidth.setWidth}
            onReset={() => rightWidth.setWidth(null)}
          />
          {right}
        </aside>
      </div>
    </>
  )
}

/**
 * A side panel opens at its token width and the person can drag it wider,
 * up to two fifths of the window. The choice is kept in this browser.
 */
function usePanelWidth(storageKey: string, token: string) {
  const [min] = useState(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(token)
      ) || 0
  )
  const [width, setWidthState] = useState<number | null>(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey))
      return stored > min ? stored : null
    } catch {
      return null
    }
  })
  const max = () => Math.max(min, window.innerWidth * 0.4)
  const setWidth = (next: number | null) => {
    const value = next !== null && next > min ? next : null
    setWidthState(value)
    try {
      if (value === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, String(value))
    } catch {
      // Storage can be blocked; the width then lasts for this visit only.
    }
  }
  return {
    width: width === null ? null : Math.min(width, max()),
    min,
    max,
    setWidth,
  }
}

function Loaded() {
  const { network, summaries } = useStudioData()
  const { panel } = useLeftPanel()
  const agentWaiting = summaries.some((s) => matchesShow(s, "proposals"))
  return (
    <Frame
      networkName={network.name}
      agentWaiting={agentWaiting}
      left={
        <ViewTransition key={panel}>
          <div className="flex min-h-0 flex-1 flex-col">
            {panel === "pipelines" && <PipelinesPanel />}
            {panel === "filters" && <FiltersPanel />}
            {panel === "agent" && <AgentPanel />}
          </div>
        </ViewTransition>
      }
      right={<PropertiesPanel />}
    >
      <MapArea />
    </Frame>
  )
}

function LoadError({ error }: { error: Error }) {
  const detail = error instanceof FixtureError ? error.detail : ""
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col gap-3 p-8 text-left"
    >
      <PanelHeader title="The network could not be loaded" className="px-0" />
      <Hint>
        {error.message} The app reads <code>{fixtureUrl()}</code>. See
        docs/fixtures.md for the format.
      </Hint>
      {detail && (
        <pre className="max-h-80 overflow-auto rounded-lg border bg-background p-3 type-ui-mono-xs whitespace-pre-wrap">
          {detail}
        </pre>
      )}
      <div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Load again
        </Button>
      </div>
    </div>
  )
}
