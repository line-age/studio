import { create } from "zustand"

import type { Bounds, ShowFilter } from "@/data/derive"

/*
 * What the person has chosen on the Studio screen. Data lives in the network
 * (src/data); this is only selection and filters.
 */

export type LeftPanel = "pipelines" | "filters" | "agent"

export type LayerId = "pipelines" | "proposed" | "ghost" | "pins"

export interface FitRequest {
  bounds: Bounds
  /** Changes on every request so the map reacts even to the same bounds. */
  nonce: number
}

/** A pipeline or section attached to the next question for the Agent. */
export interface AgentAttachment {
  kind: "pipeline" | "section"
  id: string
}

interface StudioState {
  editionId: string | null
  show: ShowFilter
  onlyInView: boolean
  layers: Record<LayerId, boolean>
  query: string
  selectedPipelineId: string | null
  /** The one section in focus: set when exactly one is ticked. */
  selectedSectionId: string | null
  /** The ticked sections of the selected pipeline; null means all of them. */
  checkedSectionIds: ReadonlySet<string> | null
  selectedAttribute: string | null
  expandedSectionIds: ReadonlySet<string>
  /** The map's current view; null until the map has drawn once. */
  view: Bounds | null
  fit: FitRequest | null
  agentAttachments: AgentAttachment[]

  setEdition: (editionId: string) => void
  setShow: (show: ShowFilter) => void
  setOnlyInView: (on: boolean) => void
  toggleLayer: (layer: LayerId) => void
  clearFilters: () => void
  setQuery: (query: string) => void
  selectPipeline: (pipelineId: string | null) => void
  selectSection: (pipelineId: string, sectionId: string) => void
  selectAttribute: (
    pipelineId: string,
    sectionId: string,
    attribute: string
  ) => void
  /** Tick or untick one section. `allIds` are the pipeline's sections. */
  toggleSection: (sectionId: string, allIds: readonly string[]) => void
  /** All ticked becomes none ticked; anything else becomes all. */
  toggleAllSections: () => void
  toggleExpanded: (sectionId: string) => void
  clearSection: () => void
  setView: (view: Bounds) => void
  requestFit: (bounds: Bounds | null) => void
  attachToAgent: (items: AgentAttachment[]) => void
  detachFromAgent: (item: AgentAttachment) => void
}

const defaultLayers: Record<LayerId, boolean> = {
  pipelines: true,
  proposed: true,
  ghost: true,
  pins: true,
}

let nonce = 0

export const useStudio = create<StudioState>((set) => ({
  editionId: null,
  show: "all",
  onlyInView: true,
  layers: defaultLayers,
  query: "",
  selectedPipelineId: null,
  selectedSectionId: null,
  checkedSectionIds: null,
  selectedAttribute: null,
  expandedSectionIds: new Set(),
  view: null,
  fit: null,
  agentAttachments: [],

  setEdition: (editionId) =>
    set({
      editionId,
      selectedPipelineId: null,
      selectedSectionId: null,
      checkedSectionIds: null,
      selectedAttribute: null,
      expandedSectionIds: new Set(),
    }),
  setShow: (show) => set({ show }),
  setOnlyInView: (onlyInView) => set({ onlyInView }),
  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  // Back to how the screen opens: every pipeline, following the map view.
  clearFilters: () => set({ show: "all", onlyInView: true }),
  setQuery: (query) => set({ query }),
  selectPipeline: (pipelineId) =>
    set({
      selectedPipelineId: pipelineId,
      selectedSectionId: null,
      checkedSectionIds: null,
      selectedAttribute: null,
    }),
  selectSection: (pipelineId, sectionId) =>
    set((s) => ({
      selectedPipelineId: pipelineId,
      selectedSectionId: sectionId,
      checkedSectionIds: new Set([sectionId]),
      selectedAttribute: null,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
    })),
  selectAttribute: (pipelineId, sectionId, attribute) =>
    set((s) => ({
      selectedPipelineId: pipelineId,
      selectedSectionId: sectionId,
      checkedSectionIds: new Set([sectionId]),
      selectedAttribute: attribute,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
    })),
  toggleSection: (sectionId, allIds) =>
    set((s) => {
      const next = new Set(s.checkedSectionIds ?? allIds)
      if (!next.delete(sectionId)) next.add(sectionId)
      const all = allIds.every((id) => next.has(id))
      const only = next.size === 1 ? [...next][0] : null
      return {
        checkedSectionIds: all ? null : next,
        selectedSectionId: only,
        selectedAttribute:
          only && only === s.selectedSectionId ? s.selectedAttribute : null,
      }
    }),
  toggleAllSections: () =>
    set((s) => ({
      checkedSectionIds: s.checkedSectionIds === null ? new Set() : null,
      selectedSectionId: null,
      selectedAttribute: null,
    })),
  toggleExpanded: (sectionId) =>
    set((s) => {
      const next = new Set(s.expandedSectionIds)
      if (!next.delete(sectionId)) next.add(sectionId)
      return { expandedSectionIds: next }
    }),
  clearSection: () =>
    set({
      selectedSectionId: null,
      checkedSectionIds: null,
      selectedAttribute: null,
    }),
  setView: (view) => set({ view }),
  requestFit: (bounds) =>
    set(bounds ? { fit: { bounds, nonce: (nonce += 1) } } : {}),
  attachToAgent: (items) =>
    set((s) => ({
      agentAttachments: [
        ...s.agentAttachments,
        ...items.filter(
          (item) =>
            !s.agentAttachments.some(
              (a) => a.kind === item.kind && a.id === item.id
            )
        ),
      ],
    })),
  detachFromAgent: (item) =>
    set((s) => ({
      agentAttachments: s.agentAttachments.filter(
        (a) => !(a.kind === item.kind && a.id === item.id)
      ),
    })),
}))

/** Zoom and centre change on every frame of a pan, so they get their own store. */
interface CameraState {
  zoom: number | null
  center: [number, number] | null
  setCamera: (zoom: number, center: [number, number]) => void
}

export const useCamera = create<CameraState>((set) => ({
  zoom: null,
  center: null,
  setCamera: (zoom, center) => set({ zoom, center }),
}))
