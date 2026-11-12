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
  /** Keep pipelines with an Unknown value for one of these attributes. */
  unknownIn: readonly string[]
  /** Keep pipelines with a section of one of these companies. */
  companies: readonly string[]
  /** Keep pipelines with a section built in this range of years. */
  builtFrom: number | null
  builtTo: number | null
  /** Keep pipelines with a section added to Lineage in this range of days. */
  addedFrom: string | null
  addedTo: string | null
  layers: Record<LayerId, boolean>
  query: string
  /** Search past the filters, through every pipeline of the edition. */
  searchWholeEdition: boolean
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
  /** The person has shut the properties panel; a selection does not reopen it. */
  propertiesHidden: boolean
  agentAttachments: AgentAttachment[]

  setEdition: (editionId: string) => void
  setShow: (show: ShowFilter) => void
  setOnlyInView: (on: boolean) => void
  toggleUnknownIn: (attribute: string) => void
  toggleCompany: (company: string) => void
  setCompanies: (companies: readonly string[]) => void
  setBuilt: (from: number | null, to: number | null) => void
  setAdded: (from: string | null, to: string | null) => void
  toggleLayer: (layer: LayerId) => void
  clearFilters: () => void
  setQuery: (query: string) => void
  setSearchWholeEdition: (on: boolean) => void
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
  toggleProperties: () => void
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

/** True when a filter differs from how the screen opens (see clearFilters). */
export const filtersApplied = (s: StudioState) =>
  s.show !== "all" ||
  !s.onlyInView ||
  s.unknownIn.length > 0 ||
  s.companies.length > 0 ||
  s.builtFrom !== null ||
  s.builtTo !== null ||
  s.addedFrom !== null ||
  s.addedTo !== null

export const useStudio = create<StudioState>((set) => ({
  editionId: null,
  show: "all",
  onlyInView: true,
  unknownIn: [],
  companies: [],
  builtFrom: null,
  builtTo: null,
  addedFrom: null,
  addedTo: null,
  layers: defaultLayers,
  query: "",
  searchWholeEdition: false,
  selectedPipelineId: null,
  selectedSectionId: null,
  checkedSectionIds: null,
  selectedAttribute: null,
  expandedSectionIds: new Set(),
  view: null,
  fit: null,
  propertiesHidden: false,
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
  toggleUnknownIn: (attribute) =>
    set((s) => ({
      unknownIn: s.unknownIn.includes(attribute)
        ? s.unknownIn.filter((a) => a !== attribute)
        : [...s.unknownIn, attribute],
    })),
  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  // Back to how the screen opens: every pipeline, following the map view.
  toggleCompany: (company) =>
    set((s) => ({
      companies: s.companies.includes(company)
        ? s.companies.filter((c) => c !== company)
        : [...s.companies, company],
    })),
  setCompanies: (companies) => set({ companies }),
  setBuilt: (builtFrom, builtTo) => set({ builtFrom, builtTo }),
  setAdded: (addedFrom, addedTo) => set({ addedFrom, addedTo }),
  clearFilters: () =>
    set({
      show: "all",
      onlyInView: true,
      unknownIn: [],
      companies: [],
      builtFrom: null,
      builtTo: null,
      addedFrom: null,
      addedTo: null,
    }),
  // A new search starts inside the filters again.
  setQuery: (query) =>
    set((s) => ({
      query,
      searchWholeEdition: query.trim() === "" ? false : s.searchWholeEdition,
    })),
  setSearchWholeEdition: (searchWholeEdition) => set({ searchWholeEdition }),
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
  // A click on empty map steps back: from some sections to the whole
  // pipeline, and from the whole pipeline to nothing selected.
  clearSection: () =>
    set((s) => ({
      selectedPipelineId:
        s.checkedSectionIds === null ? null : s.selectedPipelineId,
      selectedSectionId: null,
      checkedSectionIds: null,
      selectedAttribute: null,
    })),
  setView: (view) => set({ view }),
  requestFit: (bounds) =>
    set(bounds ? { fit: { bounds, nonce: (nonce += 1) } } : {}),
  toggleProperties: () =>
    set((s) => ({ propertiesHidden: !s.propertiesHidden })),
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
