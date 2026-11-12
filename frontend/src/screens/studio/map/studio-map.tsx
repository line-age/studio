import "mapbox-gl/dist/mapbox-gl.css"

import { useEffect, useMemo, useRef, useState } from "react"
import MapGL, {
  AttributionControl,
  Layer,
  Marker,
  Source,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox"

import { Icon } from "@/components/icons/icon"
import { MapControl } from "@/components/map-control"
import { Pin } from "@/components/pin"
import { Button } from "@/components/ui/button"
import {
  matchesShow,
  matchesCriteria,
  sectionStats,
  sectionsOutsideEdition,
  unionBounds,
  type Bounds,
} from "@/data/derive"
import type { Geometry } from "@/data/schema"

import { SEARCH_INPUT_ID } from "../panels/pipelines-panel"
import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { useLeftPanel } from "../left-panel-context"
import { useCriteria, useSelectionGroups, useStudioData } from "../studio-data"
import { useCamera, useStudio } from "../studio-store"
import { readMapColors } from "./map-colors"

const MAP_STYLE = "mapbox://styles/mapbox/light-v11"
const HIT_LAYER = "sections-hit"

/** Dash patterns are in units of the line width. Dotted needs round caps. */
const DOTTED = [0.1, 2.4]
const DASHED = [4, 3]

type Feature = {
  type: "Feature"
  geometry: Geometry
  properties: Record<string, string>
}

const collection = (features: Feature[]) => ({
  type: "FeatureCollection" as const,
  features,
})

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

function toBounds(map: MapRef): Bounds | null {
  const b = map.getBounds()
  return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null
}

export function StudioMap({ token }: { token: string }) {
  const { network, edition, summaries } = useStudioData()
  const { openPanel } = useLeftPanel()
  const mapRef = useRef<MapRef>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const layers = useStudio((s) => s.layers)
  const show = useStudio((s) => s.show)
  const criteria = useCriteria()
  const selected = useStudio((s) => s.selection)
  const groups = useSelectionGroups()
  const fit = useStudio((s) => s.fit)
  const selectSection = useStudio((s) => s.selectSection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const stepBack = useStudio((s) => s.stepBack)
  const setView = useStudio((s) => s.setView)
  const setCamera = useCamera((s) => s.setCamera)

  const selection = useSelectionAttachments()
  const boxRef = useRef<HTMLDivElement>(null)
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
      // Not in Mapbox's public API; without it the map falls back to
      // drawing a frame late, which is only the flicker again.
      const drawNow = (map as unknown as { _render?: (now: number) => void })
        ._render
      if (typeof drawNow === "function") drawNow.call(map, performance.now())
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // The sections of this edition whose pipeline passes the Show filter.
  const current = useMemo(
    () =>
      collection(
        summaries
          .filter(
            (summary) =>
              matchesShow(summary, show) && matchesCriteria(summary, criteria)
          )
          .flatMap((summary) =>
            summary.sections.map((section) => ({
              type: "Feature" as const,
              geometry: section.geometry,
              properties: {
                id: section.id,
                pipelineId: summary.id,
                status: sectionStats(section).unknown > 0 ? "unknown" : "cited",
              },
            }))
          )
      ),
    [summaries, show, criteria]
  )

  const ghosts = useMemo(
    () =>
      collection(
        sectionsOutsideEdition(network, edition.id).map((section) => ({
          type: "Feature" as const,
          geometry: section.geometry,
          properties: { id: section.id },
        }))
      ),
    [network, edition.id]
  )

  const proposed = useMemo(
    () =>
      collection(
        network.proposedPaths
          .filter((p) => p.editionIds.includes(edition.id))
          .map((p) => ({
            type: "Feature" as const,
            geometry: p.geometry,
            properties: { id: p.id },
          }))
      ),
    [network, edition.id]
  )

  const pins = useMemo(() => {
    const inEdition = new Set(
      summaries.flatMap((s) => s.sections.map((section) => section.id))
    )
    return network.notes.filter((note) => inEdition.has(note.sectionId))
  }, [network.notes, summaries])

  const initialBounds = useMemo(
    () => unionBounds(summaries.flatMap((s) => (s.bounds ? [s.bounds] : []))),
    [summaries]
  )

  // A selection made in a list asks the map to show it.
  useEffect(() => {
    if (!fit) return
    const [west, south, east, north] = fit.bounds
    mapRef.current?.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 96, maxZoom: 11, duration: reducedMotion() ? 0 : 500 }
    )
  }, [fit])

  const report = () => {
    const map = mapRef.current
    if (!map) return
    const view = toBounds(map)
    if (view) setView(view)
    const center = map.getCenter()
    setCamera(map.getZoom(), [center.lng, center.lat])
  }

  const onClick = (event: MapMouseEvent) => {
    const properties = event.features?.[0]?.properties
    if (properties?.id) {
      // Shift adds the section to the selection, or takes it off.
      if (event.originalEvent.shiftKey) toggleSelected([String(properties.id)])
      else selectSection(String(properties.id))
    } else {
      stepBack(groups.flatMap((g) => g.summary.sections.map((s) => s.id)))
    }
  }

  const onMouseMove = (event: MapMouseEvent) => {
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
      <AddToAgentMenu items={selection}>
        <div className="absolute inset-0">
          <MapGL
            ref={mapRef}
            mapboxAccessToken={token}
            mapStyle={MAP_STYLE}
            initialViewState={
              initialBounds
                ? {
                    bounds: [
                      [initialBounds[0], initialBounds[1]],
                      [initialBounds[2], initialBounds[3]],
                    ],
                    fitBoundsOptions: { padding: 64 },
                  }
                : { longitude: 0, latitude: 0, zoom: 1 }
            }
            interactiveLayerIds={[HIT_LAYER]}
            cursor={hoveredId ? "pointer" : "grab"}
            logoPosition="top-left"
            attributionControl={false}
            dragRotate={false}
            trackResize={false}
            onLoad={report}
            onMoveEnd={report}
            onMove={(event) =>
              setCamera(event.viewState.zoom, [
                event.viewState.longitude,
                event.viewState.latitude,
              ])
            }
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

            <Source id="ghosts" type="geojson" data={ghosts}>
              <Layer
                id="ghost-lines"
                type="line"
                layout={{ visibility: visibility(layers.ghost) }}
                paint={{ "line-color": colors.ghost, "line-width": 1 }}
              />
            </Source>

            <Source id="sections" type="geojson" data={current}>
              <Layer
                id="sections-selected-halo"
                type="line"
                filter={selectedFilter}
                layout={{
                  visibility: visibility(layers.pipelines),
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
                  visibility: visibility(layers.pipelines),
                  "line-cap": "round",
                }}
                paint={{
                  "line-color": colors.line,
                  "line-width": 6,
                  "line-opacity": 0.15,
                }}
              />
              <Layer
                id="sections-cited"
                type="line"
                filter={["==", ["get", "status"], "cited"]}
                layout={{
                  visibility: visibility(layers.pipelines),
                  "line-join": "round",
                }}
                paint={{
                  "line-color": [
                    "case",
                    selectedFilter,
                    colors.selected,
                    colors.line,
                  ],
                  "line-width": 2,
                }}
              />
              <Layer
                id="sections-unknown"
                type="line"
                filter={["==", ["get", "status"], "unknown"]}
                layout={{
                  visibility: visibility(layers.pipelines),
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
                  "line-width": 2.5,
                  "line-dasharray": DOTTED,
                }}
              />
              <Layer
                id={HIT_LAYER}
                type="line"
                layout={{ visibility: visibility(layers.pipelines) }}
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

            {layers.pins &&
              pins.map((note) => (
                <Marker
                  key={note.id}
                  longitude={note.position[0]}
                  latitude={note.position[1]}
                  anchor="center"
                >
                  <span className="sr-only">Note</span>
                  <Pin number={note.number} />
                </Marker>
              ))}
          </MapGL>
        </div>
      </AddToAgentMenu>

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <MapControl>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search pipelines"
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
