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
import { SidePanel } from "./side-panel"
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
  const [leftOpen, setLeftOpen] = useState(true)

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
      open: leftOpen,
      openPanel: (next: LeftPanel) => {
        setLeftOpen(true)
        startTransition(() => setPanel(next))
      },
      togglePanel: (next: LeftPanel) => {
        if (leftOpen && next === panel) setLeftOpen(false)
        else {
          setLeftOpen(true)
          startTransition(() => setPanel(next))
        }
      },
    }),
    [panel, leftOpen]
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
      setLeftOpen(true)
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
  const { panel, open, togglePanel } = useLeftPanel()
  const rightOpen = useStudio((s) => s.selectedPipelineId !== null)
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
            active={open && panel === "pipelines"}
            onClick={() => togglePanel("pipelines")}
          />
          <RailItem
            icon="filter"
            label="Filters"
            indicator={filtersApplied ? { label: "filters applied" } : null}
            active={open && panel === "filters"}
            onClick={() => togglePanel("filters")}
          />
          <RailItem
            icon="ask"
            label="Agent"
            indicator={
              agentWaiting ? { label: "waiting for you", tone: "ai" } : null
            }
            active={open && panel === "agent"}
            onClick={() => togglePanel("agent")}
          />
        </nav>
        <SidePanel
          side="left"
          open={open}
          label={panel}
          storageKey="studio.left-panel-width"
          widthToken="--layout-panel-left"
          className="border-sidebar-border bg-sidebar"
        >
          {left}
        </SidePanel>
        <main
          id="map"
          tabIndex={-1}
          aria-label="Map"
          className="relative min-w-0 flex-1 bg-map-basemap outline-none"
        >
          {children}
        </main>
        {/* The properties panel is there only while something is selected. */}
        <SidePanel
          side="right"
          open={rightOpen}
          label="Properties"
          storageKey="studio.right-panel-width"
          widthToken="--layout-panel-right"
          className="bg-background"
        >
          {right}
        </SidePanel>
      </div>
    </>
  )
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
