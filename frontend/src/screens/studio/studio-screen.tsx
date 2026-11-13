import {
  Suspense,
  ViewTransition,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { ErrorBoundary } from "@/components/error-boundary"
import { Hint } from "@/components/hint"
import { LoadBar } from "@/components/load-bar"
import { PanelHeader } from "@/components/panel-header"
import { RailItem } from "@/components/rail-item"
import { Button } from "@/components/ui/button"
import {
  attributeNames,
  companyOf,
  geometryBounds,
  groupsLabel,
  sectionLabel,
  unionBounds,
} from "@/data/derive"
import { fixtureUrl, loadNetwork } from "@/data/load-network"
import { FixtureError } from "@/data/schema"
import { StoreError } from "@/data/store/client"

import { LeftPanelContext, useLeftPanel } from "./left-panel-context"
import { MapArea } from "./map/map-area"
import { ShowPanels } from "./panel-toggle"
import { AgentPanel } from "./panels/agent-panel"
import { PipelinesPanel, SEARCH_INPUT_ID } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { SettingsDialog } from "./settings-dialog"
import { SidePanel } from "./side-panel"
import {
  StudioDataProvider,
  useSelectionGroups,
  useStudioData,
} from "./studio-data"
import { useStudio, type LeftPanel } from "./studio-store"
import { TopBar, type Crumb } from "./top-bar"
import { applyUrl, followView, type UrlView } from "./url-state"

/*
 * Studio: the map desk. Top bar, rail, one left panel (Sections or
 * Agent), the map, and the properties of what is selected. One
 * button hides both side panels and leaves the rail. Read-only: it
 * shows the network and what the AI proposes; nothing can be changed here yet.
 */
export function StudioScreen() {
  // The view in the URL is applied once, before anything draws.
  const [linked] = useState(() => applyUrl(window.location.search))
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
      toggleOpen: () => setLeftOpen((open) => !open),
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
              <Loaded linked={linked} />
            </StudioDataProvider>
          </Suspense>
        </ErrorBoundary>
      </div>
    </LeftPanelContext>
  )
}

/** The least the map keeps when the list is widened into a table. */
const MAP_MIN_WIDTH = 400

function listMaxWidth(rightOpen: boolean): number {
  const token = (name: string) =>
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(name)
    ) || 0
  return (
    window.innerWidth -
    token("--layout-rail") -
    MAP_MIN_WIDTH -
    (rightOpen ? token("--layout-panel-right") : 0)
  )
}

/** The screen's frame. Used empty while loading and around a load error. */
function Frame({
  networkName,
  trail,
  onHome,
  agentWaiting = false,
  attributes,
  left,
  right,
  busy = false,
  children,
}: {
  networkName?: string
  trail?: Crumb[]
  onHome?: () => void
  /** The Agent has proposals the person has not decided on. */
  agentWaiting?: boolean
  /** The attributes of the data. With them, Settings can open. */
  attributes?: readonly string[]
  left?: ReactNode
  right?: ReactNode
  busy?: boolean
  /** The centre: the map, or a message. */
  children?: ReactNode
}) {
  const { panel, open, togglePanel } = useLeftPanel()
  const hasSelection = useStudio((s) => s.selection.size > 0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Hiding the side panels hides both; the rail stays.
  const rightOpen = open && hasSelection
  return (
    <>
      <TopBar
        networkName={networkName}
        trail={trail}
        onRoot={onHome}
        onSettings={attributes ? () => setSettingsOpen(true) : undefined}
      />
      {attributes && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          attributes={attributes}
        />
      )}
      <div className="flex min-h-0 flex-1" aria-busy={busy}>
        <nav
          aria-label="Panels"
          className="flex w-rail shrink-0 flex-col gap-1 border-r bg-muted py-2"
        >
          <RailItem
            icon="line"
            label="Sections"
            active={open && panel === "pipelines"}
            onClick={() => togglePanel("pipelines")}
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
          // The list and the Agent each keep their own width.
          storageKey={
            panel === "agent"
              ? "studio.agent-panel-width"
              : "studio.left-panel-width"
          }
          widthToken="--layout-panel-left"
          {...(panel === "pipelines" && {
            // The list widens into a table; the map keeps room to work in.
            maxWidth: listMaxWidth(rightOpen),
            wideWidth: 760,
          })}
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
          {!open && <ShowPanels className="absolute top-3 left-3 z-10" />}
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

/**
 * The breadcrumb after the app name: selected pipeline, selected section.
 * `home` clears the selection and shows the whole network again.
 */
function useTrail(): { trail: Crumb[]; home: () => void } {
  const { summaries, sectionById } = useStudioData()
  const groups = useSelectionGroups()
  const sectionId = useStudio((s) => s.selectedSectionId)
  const select = useStudio((s) => s.select)
  const requestFit = useStudio((s) => s.requestFit)

  const section = sectionId ? sectionById.get(sectionId) : undefined
  const trail: Crumb[] = []
  // Back to the whole of every pipeline touched.
  const whole = () => {
    select(groups.flatMap((g) => g.summary.sections.map((s) => s.id)))
    requestFit(
      unionBounds(
        groups.flatMap((g) => (g.summary.bounds ? [g.summary.bounds] : []))
      )
    )
  }
  if (groups.length === 1) {
    trail.push({ label: groups[0].summary.name, onClick: whole })
  } else if (groups.length > 1) {
    trail.push({
      label: groupsLabel(groups.map((g) => g.summary)),
      onClick: whole,
    })
  }
  if (groups.length > 0 && section) trail.push({ label: sectionLabel(section) })
  const home = () => {
    select([])
    requestFit(
      unionBounds(summaries.flatMap((s) => (s.bounds ? [s.bounds] : []))),
      true
    )
  }
  return { trail, home }
}

function Loaded({ linked }: { linked: UrlView }) {
  const { network, summaries } = useStudioData()
  useLinkedView(linked)
  const { panel } = useLeftPanel()
  const agentWaiting = summaries.some((s) => s.needsDecision)
  const { trail, home } = useTrail()
  const attributes = useMemo(() => attributeNames(summaries), [summaries])
  return (
    <Frame
      networkName={network.name}
      trail={trail}
      onHome={home}
      agentWaiting={agentWaiting}
      attributes={attributes}
      left={
        <ViewTransition key={panel}>
          <div className="flex min-h-0 flex-1 flex-col">
            {panel === "pipelines" && <PipelinesPanel />}
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

/**
 * Once the data is here: drop what the link names and the data does not
 * have, open the section it points at, and from then on keep the address
 * bar in step with the view.
 */
function useLinkedView(linked: UrlView) {
  const { network, edition, sectionById } = useStudioData()
  const checked = useRef(false)
  useEffect(() => {
    if (!checked.current) {
      checked.current = true
      const s = useStudio.getState()
      const sections = network.sections
      const companies = new Set(sections.flatMap((x) => companyOf(x) ?? []))
      const attributes = new Set(
        sections.flatMap((x) => x.claims.map((claim) => claim.attribute))
      )
      useStudio.setState({
        editionId: s.editionId === edition.id ? s.editionId : null,
        companies: s.companies.filter((name) => companies.has(name)),
        unknownIn: s.unknownIn.filter((name) => attributes.has(name)),
      })
      const section = linked.section ? sectionById.get(linked.section) : null
      if (section?.editionIds.includes(edition.id)) {
        s.selectSection(section.id)
        // A link with the map's place shows that place; else the section.
        if (!linked.camera) s.requestFit(geometryBounds(section.geometry))
      }
    }
    return followView()
    // Once: the link is read when the data first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function LoadError({ error }: { error: Error }) {
  const fromStore = error instanceof StoreError
  const detail = error instanceof FixtureError || fromStore ? error.detail : ""
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col gap-3 p-8 text-left"
    >
      <PanelHeader title="The network could not be loaded" className="px-0" />
      {fromStore ? (
        <Hint>{error.message} The app reads the Lineage store.</Hint>
      ) : (
        <Hint>
          {error.message} The app reads <code>{fixtureUrl()}</code>. See
          docs/fixtures.md for the format.
        </Hint>
      )}
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
