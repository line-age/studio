import "mapbox-gl/dist/mapbox-gl.css"

import { useEffect, useMemo, useRef, useState } from "react"
import MapGL, {
  AttributionControl,
  Layer,
  Source,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox"

import { Icon } from "@/components/icons/icon"
import { MapControl } from "@/components/map-control"
import { ToolPalette } from "@/components/tool-palette"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { unionBounds, type Bounds } from "@/data/derive"
import { useSectionDetail } from "@/data/detail-store"
import { proposedEndsFor } from "@/data/evidence"
import { cn } from "@/lib/utils"

import { SEARCH_INPUT_ID } from "../panels/pipelines-panel"
import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { useSectionChanges } from "../pipeline-actions"
import { useLeftPanel } from "../left-panel-context"
import { useSettings } from "../settings"
import { useCriteria, useSelectionGroups, useStudioData } from "../studio-data"
import { useCamera, useStudio } from "../studio-store"
import { linesInLoop, type Point } from "./lasso"
import { readMapColors } from "./map-colors"
import { addKeyName, holdsAddKey, mapClick } from "./click-selection"
import { FollowMapToggle } from "./follow-map-toggle"
import { DOTTED_EXTRA, LINE_WEIGHT, statusesDrawn } from "./line-style"
import { sectionFeatures, type SectionFeature } from "./section-features"
import { MapKey } from "./map-key"
import { AgentBar } from "./selection-bar"

const MAP_STYLE = "mapbox://styles/mapbox/light-v11"
const HIT_LAYER = "sections-hit"
/** How the map frames a selection it is asked to show. */
const FIT_OPTIONS = { padding: 96, maxZoom: 11 }
/** How long after a move a resize redoes it: a panel's slide, and some. */
const REFIT_WINDOW = 800

/** Dash patterns are in units of the line width. Dotted needs round caps. */
const DOTTED = [0.1, 2.4]
const DASHED = [4, 3]

type Feature = SectionFeature

const collection = (features: Feature[]) => ({
  type: "FeatureCollection" as const,
  features,
})

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The tools that do something. The rest of the palette waits for editing. */
const TOOLS = ["select", "lasso"] as const

function toBounds(map: MapRef): Bounds | null {
  const b = map.getBounds()
  return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null
}

export function StudioMap({ token }: { token: string }) {
  const { network, everySection, scoped: summaries } = useStudioData()
  const { openPanel } = useLeftPanel()
  const mapRef = useRef<MapRef>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const layers = useStudio((s) => s.layers)
  const criteria = useCriteria()
  // Solid or dotted follows the status, as chosen in Settings.
  const lineStyle = useSettings((s) => s.lineStyle)
  const solid = statusesDrawn(lineStyle, "solid")
  const dotted = statusesDrawn(lineStyle, "dotted")
  const selected = useStudio((s) => s.selection)
  /** The section being read in the right panel, ticked or not. */
  const readingId = useStudio((s) => s.selectedSectionId)
  const readingAttribute = useStudio((s) => s.selectedAttribute)
  const groups = useSelectionGroups()
  const fit = useStudio((s) => s.fit)
  const selectSection = useStudio((s) => s.selectSection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const focusSection = useStudio((s) => s.focusSection)
  const stepBack = useStudio((s) => s.stepBack)
  const select = useStudio((s) => s.select)
  const tool = useStudio((s) => s.tool)
  const setTool = useStudio((s) => s.setTool)

  // The loop being drawn with the Lasso, in screen pixels.
  const [loop, setLoop] = useState<Point[] | null>(null)
  const loopRef = useRef<Point[] | null>(null)
  // The bar at the top of the map offers the Agent for the selection just
  // made, until it changes (see AgentBar).
  const bar = useStudio((s) => s.agentBar)
  const offerAgent = useStudio((s) => s.offerAgent)
  const dismissAgentBar = useStudio((s) => s.dismissAgentBar)
  // The hint sits under the bar while the bar shows.
  const barShown = bar !== null && bar === selected
  // A click can follow the release that ends a loop; it must not select.
  const skipClick = useRef(false)
  const setView = useStudio((s) => s.setView)
  const setCamera = useCamera((s) => s.setCamera)

  const selection = useSelectionAttachments()
  const sectionChanges = useSectionChanges()
  const edit = useStudio((s) => s.edit)
  const boxRef = useRef<HTMLDivElement>(null)
  /** The last move asked for, so a resize right after can redo it. */
  const lastFit = useRef<{
    bounds: Bounds
    follow: boolean
    at: number
  } | null>(null)
  const colors = useMemo(() => readMapColors(), [])

  // The side panels slide open and shut, so the map's box changes size on
  // every frame of the slide. Changing a canvas's size clears it, and Mapbox
  // draws again only on the next frame, which shows as flicker. So Mapbox's
  // own resize tracking is off (trackResize) and this does it: resize, then
  // draw at once, inside the same frame.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(() => {
      const map = mapRef.current?.getMap()
      if (!map) return
      map.resize()
      // Selecting often opens the right panel too: the map was fitted to
      // its old, wider box and would leave part of the selection outside.
      // While the panel slides, fit again to the box as it is now.
      const last = lastFit.current
      if (last && performance.now() - last.at < REFIT_WINDOW) {
        const [west, south, east, north] = last.bounds
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { ...FIT_OPTIONS, duration: 0 },
          { quiet: !last.follow }
        )
      }
      // Not in Mapbox's public API; without it the map falls back to
      // drawing a frame late, which is only the flicker again.
      const drawNow = (map as unknown as { _render?: (now: number) => void })
        ._render
      if (typeof drawNow === "function") drawNow.call(map, performance.now())
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The sections the switch shows, sorted by the filters. What the switch
  // leaves out is in neither source: see sectionFeatures.
  const [current, faint] = useMemo(() => {
    const features = sectionFeatures(summaries, criteria)
    return [collection(features.drawn), collection(features.faint)]
  }, [summaries, criteria])

  // The lines traced as gone behind the proposal being read: an end on Last
  // seen, a cut on Geometry. Drawn only while that claim is open.
  const readingSection = useMemo(
    () => network.sections.find((s) => s.id === readingId),
    [network, readingId]
  )
  // Their routes come with the section's detail, read when it was opened.
  const readingDetail = useSectionDetail(readingSection).detail
  const readingEnds = useMemo(
    () =>
      readingSection && readingAttribute && readingDetail
        ? proposedEndsFor(
            { ...readingSection, proposedEnds: readingDetail.proposedEnds },
            readingAttribute
          ).flatMap((end) =>
            end.geometry ? [{ ...end, geometry: end.geometry }] : []
          )
        : [],
    [readingSection, readingAttribute, readingDetail]
  )

  const proposed = useMemo(
    () =>
      collection([
        ...network.proposedPaths.map((p) => ({
          type: "Feature" as const,
          geometry: p.geometry,
          properties: { id: p.id },
        })),
        ...readingEnds.map((end) => ({
          type: "Feature" as const,
          geometry: end.geometry,
          properties: { id: end.id },
        })),
      ]),
    [network, readingEnds]
  )

  const initialBounds = useMemo(
    () =>
      unionBounds(everySection.flatMap((s) => (s.bounds ? [s.bounds] : []))),
    [everySection]
  )

  // Where the map opens: the place a link gave, else a section a link
  // points at, else the whole network. Read once; the map keeps its own place.
  const [initialView] = useState(() => {
    const { zoom, center } = useCamera.getState()
    if (zoom !== null && center !== null) {
      return { longitude: center[0], latitude: center[1], zoom }
    }
    const open = useStudio.getState().fit?.bounds ?? initialBounds
    return open
      ? {
          bounds: [
            [open[0], open[1]],
            [open[2], open[3]],
          ] as [[number, number], [number, number]],
          fitBoundsOptions: { padding: 64, maxZoom: 11 },
        }
      : { longitude: 0, latitude: 0, zoom: 1 }
  })

  // A selection made in a list asks the map to show it.
  useEffect(() => {
    if (!fit) return
    lastFit.current = {
      bounds: fit.bounds,
      follow: fit.follow,
      at: performance.now(),
    }
    const [west, south, east, north] = fit.bounds
    mapRef.current?.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { ...FIT_OPTIONS, duration: reducedMotion() ? 0 : 500 },
      // Read back in report(): a quiet move does not change the list.
      { quiet: !fit.follow }
    )
  }, [fit])

  // Tells the list what the map shows. A move the app made to show a
  // selection is quiet: zooming to one pipeline must not drop the others
  // from the "in view" list. The next move by hand brings the list along.
  const report = (event?: object) => {
    const map = mapRef.current
    if (!map) return
    const quiet = event !== undefined && "quiet" in event && event.quiet
    const view = toBounds(map)
    if (view && !quiet) setView(view)
    const center = map.getCenter()
    setCamera(map.getZoom(), [center.lng, center.lat])
  }

  const cancelLoop = () => {
    loopRef.current = null
    setLoop(null)
  }

  // Releasing the mouse closes the loop: what it touches is selected.
  const finishLoop = (shift: boolean) => {
    const points = loopRef.current
    if (!points) return
    cancelLoop()
    skipClick.current = true
    setTimeout(() => (skipClick.current = false), 0)
    const map = mapRef.current
    if (!map) return
    const lines = current.features.map((feature) => ({
      id: feature.properties.id,
      paths: (feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
      ).map((path) =>
        path.map((position): Point => {
          const at = map.project([position[0], position[1]])
          return [at.x, at.y]
        })
      ),
    }))
    const caught = linesInLoop(points, lines)
    // Nothing caught changes nothing; the Lasso stays in hand to try again.
    if (caught.length === 0) return
    select(shift ? [...new Set([...selected, ...caught])] : caught)
    offerAgent()
    setTool("select")
  }
  const finishRef = useRef(finishLoop)
  useEffect(() => {
    finishRef.current = finishLoop
  })

  // V and L pick the tool; Esc drops a loop, then the bar, then the Lasso.
  // A release outside the map still ends the loop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable]")
      ) {
        return
      }
      if (event.key === "Escape") {
        if (loopRef.current) cancelLoop()
        else if (bar) dismissAgentBar()
        else setTool("select")
      } else if (event.key === "v" || event.key === "V") setTool("select")
      else if (event.key === "l" || event.key === "L") setTool("lasso")
    }
    const onMouseUp = (event: MouseEvent) => finishRef.current(event.shiftKey)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [bar, dismissAgentBar, setTool])

  const onMouseDown = (event: MapMouseEvent) => {
    const { button, ctrlKey } = event.originalEvent
    // Ctrl and drag turns the map, whatever the tool.
    if (tool !== "lasso" || button !== 0 || ctrlKey) return
    event.preventDefault()
    loopRef.current = [[event.point.x, event.point.y]]
    setLoop(loopRef.current)
  }

  const onClick = (event: MapMouseEvent) => {
    if (skipClick.current || tool === "lasso") return
    const properties = event.features?.[0]?.properties
    const id = properties?.id ? String(properties.id) : null
    // A click selects one section. With Cmd (Ctrl off a Mac) held it adds
    // one, or takes a selected one off.
    const action = mapClick({
      onSection: id !== null,
      addKey: holdsAddKey(event.originalEvent),
      empty: selected.size === 0,
    })
    if (action === "nothing") return
    dismissAgentBar()
    if (action === "step-back" || id === null) {
      stepBack(groups.flatMap((g) => g.summary.sections.map((s) => s.id)))
      return
    }
    if (action === "select-one") selectSection(id)
    else toggleSelected([id])
    // Every selection made on the map offers the Agent.
    const selection = useStudio.getState().selection
    // Of several, the one just added is the one opened on the right.
    if (selection.size > 1 && selection.has(id)) focusSection(id)
    offerAgent()
  }

  const onMouseMove = (event: MapMouseEvent) => {
    const points = loopRef.current
    if (points) {
      const last = points[points.length - 1]
      const { x, y } = event.point
      if (Math.hypot(x - last[0], y - last[1]) >= 2) {
        loopRef.current = [...points, [x, y]]
        setLoop(loopRef.current)
      }
      return
    }
    const id = event.features?.[0]?.properties?.id
    setHoveredId(id ? String(id) : null)
  }

  const selectedFilter = useMemo(
    () => ["in", ["get", "id"], ["literal", [...selected]]],
    [selected]
  )
  const visibility = (on: boolean) => (on ? "visible" : "none")

  if (failed) {
    throw new Error("The map could not load its style.")
  }

  return (
    <div ref={boxRef} className="absolute inset-0">
      {/* Right click on the map offers what is selected to the Agent. */}
      <AddToAgentMenu
        items={selection}
        changes={sectionChanges([...selected])}
        edit={
          selected.size > 0
            ? {
                name: "",
                count: selected.size,
                // On the map no row was clicked: one is Edit, several are
                // Edit selected (n) alone, never more than the menu says.
                ...(selected.size === 1
                  ? {
                      onEditOne: () =>
                        edit({
                          kind: "edit-sections",
                          sectionIds: [...selected],
                        }),
                    }
                  : {}),
                onEditAll: () =>
                  edit({ kind: "edit-sections", sectionIds: [...selected] }),
              }
            : undefined
        }
      >
        <div className="absolute inset-0">
          {/* On a Mac, Ctrl and click is a right click: it turns the map
              here, so it must not open the menu as well. */}
          <div
            className="absolute inset-0"
            onContextMenu={(event) => {
              if (event.ctrlKey) event.stopPropagation()
            }}
          >
            <MapGL
              ref={mapRef}
              mapboxAccessToken={token}
              mapStyle={MAP_STYLE}
              initialViewState={initialView}
              interactiveLayerIds={[HIT_LAYER]}
              cursor={
                tool === "lasso" ? "crosshair" : hoveredId ? "pointer" : "grab"
              }
              dragPan={tool !== "lasso"}
              boxZoom={false}
              onMouseDown={onMouseDown}
              logoPosition="bottom-left"
              attributionControl={false}
              // Ctrl and drag turns the map; "Reset north" turns it back.
              dragRotate
              pitchWithRotate={false}
              touchPitch={false}
              trackResize={false}
              onLoad={report}
              onMoveEnd={report}
              onMove={(event) => {
                setCamera(event.viewState.zoom, [
                  event.viewState.longitude,
                  event.viewState.latitude,
                ])
              }}
              onClick={onClick}
              onMouseMove={onMouseMove}
              onMouseLeave={() => setHoveredId(null)}
              onError={(event) => {
                console.error(event.error)
                if (!mapRef.current?.isStyleLoaded()) setFailed(true)
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <AttributionControl compact position="bottom-right" />

              {/* What the filters leave out. Not clickable: it is not in the list. */}
              <Source id="faint" type="geojson" data={faint}>
                <Layer
                  id="faint-lines"
                  type="line"
                  layout={{ visibility: visibility(layers.faint) }}
                  paint={{ "line-color": colors.ghost, "line-width": 1 }}
                />
              </Source>

              <Source id="sections" type="geojson" data={current}>
                <Layer
                  id="sections-selected-halo"
                  type="line"
                  filter={selectedFilter}
                  layout={{
                    "line-cap": "round",
                    "line-join": "round",
                  }}
                  paint={{
                    "line-color": colors.selected,
                    "line-width": 9,
                    "line-opacity": 0.25,
                  }}
                />
                <Layer
                  id="sections-hover"
                  type="line"
                  filter={["==", ["get", "id"], hoveredId ?? ""]}
                  layout={{
                    "line-cap": "round",
                  }}
                  paint={{
                    "line-color": colors.line,
                    "line-width": 6,
                    "line-opacity": 0.15,
                  }}
                />
                <Layer
                  id="sections-solid"
                  type="line"
                  filter={["in", ["get", "status"], ["literal", solid]]}
                  layout={{
                    "line-join": "round",
                  }}
                  paint={{
                    "line-color": [
                      "case",
                      selectedFilter,
                      colors.selected,
                      colors.line,
                    ],
                    "line-width": [
                      "case",
                      ["get", "placed"],
                      LINE_WEIGHT.placed,
                      LINE_WEIGHT.unplaced,
                    ],
                  }}
                />
                <Layer
                  id="sections-dotted"
                  type="line"
                  filter={["in", ["get", "status"], ["literal", dotted]]}
                  layout={{
                    "line-cap": "round",
                    "line-join": "round",
                  }}
                  paint={{
                    "line-color": [
                      "case",
                      selectedFilter,
                      colors.selected,
                      colors.line,
                    ],
                    "line-width": [
                      "case",
                      ["get", "placed"],
                      LINE_WEIGHT.placed + DOTTED_EXTRA,
                      LINE_WEIGHT.unplaced + DOTTED_EXTRA,
                    ],
                    "line-dasharray": DOTTED,
                  }}
                />
                {/* The section open in the right panel, drawn over the rest. */}
                <Layer
                  id="sections-reading"
                  type="line"
                  filter={["==", ["get", "id"], readingId ?? ""]}
                  layout={{
                    "line-cap": "round",
                    "line-join": "round",
                  }}
                  paint={{
                    "line-color": colors.selected,
                    "line-width": 4,
                  }}
                />
                <Layer
                  id={HIT_LAYER}
                  type="line"
                  paint={{
                    "line-color": colors.line,
                    "line-width": 14,
                    "line-opacity": 0,
                  }}
                />
              </Source>

              <Source id="proposed" type="geojson" data={proposed}>
                <Layer
                  id="proposed-paths"
                  type="line"
                  layout={{ visibility: visibility(layers.proposed) }}
                  paint={{
                    "line-color": colors.proposed,
                    "line-width": 2,
                    "line-dasharray": DASHED,
                  }}
                />
              </Source>
            </MapGL>
          </div>
        </div>
      </AddToAgentMenu>

      {loop && loop.length > 1 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <polygon
            points={loop.map((p) => p.join(",")).join(" ")}
            className="fill-map-selected/10 stroke-map-selected"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <AgentBar />

      {/* How to select several: said while exactly one section is selected
          and the Select tool is in hand. At the top centre, under the
          SelectionBar when that shows; never by the tools. No border, no
          shadow: it is not a control and takes no click. */}
      {tool === "select" && selected.size === 1 && (
        <p
          className={cn(
            "pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 type-ui-xs whitespace-nowrap text-muted-foreground",
            barShown ? "top-14" : "top-3"
          )}
        >
          Hold <Kbd>{addKeyName()}</Kbd> to select several
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
        <div data-tour="tools" className="pointer-events-auto">
          <ToolPalette
            value={tool}
            only={TOOLS}
            onValueChange={(next) => {
              if (next === "select" || next === "lasso") setTool(next)
            }}
          />
        </div>
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <MapControl>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search the list"
            onClick={() => {
              openPanel("pipelines")
              requestAnimationFrame(() =>
                document.getElementById(SEARCH_INPUT_ID)?.focus()
              )
            }}
          >
            <Icon name="search" />
          </Button>
        </MapControl>
        {/* One area of the Help tour. */}
        <div data-tour="layers" className="flex flex-col gap-2">
          <MapKey />
          <FollowMapToggle />
        </div>
        <MapControl label="Zoom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <Icon name="plus" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <Icon name="minus" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset north"
            onClick={() => mapRef.current?.resetNorth()}
          >
            <Icon name="north" />
          </Button>
        </MapControl>
      </div>
    </div>
  )
}
