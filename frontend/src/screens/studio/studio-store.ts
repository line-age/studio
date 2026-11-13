import { create } from "zustand"

import type { Bounds } from "@/data/derive"
import type { SectionStatus } from "@/data/status"

/*
 * What the person has chosen on the Studio screen. Data lives in the network
 * (src/data); this is only selection and filters.
 */

/** "pipelines" is the list: pipelines, then the sections in no pipeline. */
export type LeftPanel = "pipelines" | "agent"

export type LayerId = "pipelines" | "proposed" | "ghost"

export interface FitRequest {
  bounds: Bounds
  /** Changes on every request so the map reacts even to the same bounds. */
  nonce: number
  /**
   * The pipeline list follows the map to the new view. Off for a move that
   * only shows a selection: the list stays as the person left it.
   */
  follow: boolean
}

/**
 * Sections of one pipeline attached to the next question for the Agent:
 * some of them, or "all". One attachment per pipeline.
 */
export interface AgentAttachment {
  pipelineId: string
  sectionIds: readonly string[] | "all"
}

/** The map tool in hand. Select clicks sections; Lasso draws a loop round them. */
export type MapTool = "select" | "lasso"

interface StudioState {
  editionId: string | null
  /** Keep what has a section with this status. */
  status: SectionStatus | "all"
  /** Keep what has a section with a proposal waiting. */
  needsDecisionOnly: boolean
  /** The person's choice: the list follows the map. See `listFollowsMap`. */
  onlyInView: boolean
  /**
   * The list is widened into a table. A wider list narrows the map, so while
   * it is a table the list holds everything and following waits.
   */
  tableOpen: boolean
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
  /** The selected sections. They may belong to several pipelines. */
  selection: ReadonlySet<string>
  /**
   * The one section in focus: the only selected one, or the one opened in
   * the properties panel while several are selected.
   */
  selectedSectionId: string | null
  tool: MapTool
  selectedAttribute: string | null
  expandedSectionIds: ReadonlySet<string>
  /** The map's current view; null until the map has drawn once. */
  view: Bounds | null
  fit: FitRequest | null
  agentAttachments: AgentAttachment[]
  /** Goes up each time something is handed to the Agent; the chat takes focus. */
  agentAsked: number

  setEdition: (editionId: string) => void
  /** Choose a status; the one already chosen goes back to all. */
  setStatus: (status: SectionStatus | "all") => void
  setNeedsDecisionOnly: (on: boolean) => void
  setOnlyInView: (on: boolean) => void
  setTableOpen: (open: boolean) => void
  toggleUnknownIn: (attribute: string) => void
  toggleCompany: (company: string) => void
  setCompanies: (companies: readonly string[]) => void
  setBuilt: (from: number | null, to: number | null) => void
  setAdded: (from: string | null, to: string | null) => void
  toggleLayer: (layer: LayerId) => void
  clearFilters: () => void
  setQuery: (query: string) => void
  setSearchWholeEdition: (on: boolean) => void
  /** Select exactly these sections; none clears the selection. */
  select: (sectionIds: readonly string[]) => void
  /** Add these sections to what is selected. */
  addToSelection: (sectionIds: readonly string[]) => void
  /** All of these selected: take them off. Otherwise add them. */
  toggleSelected: (sectionIds: readonly string[]) => void
  /** Select exactly this one section and open it. */
  selectSection: (sectionId: string) => void
  /**
   * Open a section to read it, ticked or not, without changing the selection.
   * The map marks it as the one being read.
   */
  focusSection: (sectionId: string) => void
  /** Choose a claim. `keep` leaves a selection of several sections as it is. */
  selectAttribute: (
    sectionId: string,
    attribute: string,
    keep?: boolean
  ) => void
  /** Put the claim detail away; the section stays open. */
  closeAttribute: () => void
  toggleExpanded: (sectionId: string) => void
  /**
   * Step the selection back: from some sections to their whole pipelines
   * (`wholeIds`: every section of the pipelines touched), then to nothing.
   */
  stepBack: (wholeIds: readonly string[]) => void
  setTool: (tool: MapTool) => void
  setView: (view: Bounds) => void
  /** `follow` also moves the "in view" list to the new place. */
  requestFit: (bounds: Bounds | null, follow?: boolean) => void
  attachToAgent: (items: AgentAttachment[]) => void
  /** Attach, and ask the chat to take the cursor. */
  askAgent: (items: AgentAttachment[]) => void
  detachFromAgent: (pipelineId: string) => void
}

function mergeAttachments(
  had: AgentAttachment[],
  items: AgentAttachment[]
): AgentAttachment[] {
  const next = [...had]
  for (const item of items) {
    const at = next.findIndex((a) => a.pipelineId === item.pipelineId)
    if (at === -1) {
      next.push(item)
      continue
    }
    const before = next[at].sectionIds
    next[at] = {
      pipelineId: item.pipelineId,
      sectionIds:
        before === "all" || item.sectionIds === "all"
          ? "all"
          : [...new Set([...before, ...item.sectionIds])],
    }
  }
  return next
}

/** The section in focus follows the selection: the only one, or none. */
const selected = (ids: Iterable<string>) => {
  const selection = new Set(ids)
  return {
    selection,
    selectedSectionId: selection.size === 1 ? [...selection][0] : null,
  }
}

const defaultLayers: Record<LayerId, boolean> = {
  pipelines: true,
  proposed: true,
  ghost: true,
}

let nonce = 0

/**
 * True when one of the filters behind the filter button is on. The status
 * counts and "list follows the map" have their own controls and do not count.
 */
export const filtersApplied = (s: StudioState) =>
  s.unknownIn.length > 0 ||
  s.companies.length > 0 ||
  s.builtFrom !== null ||
  s.builtTo !== null ||
  s.addedFrom !== null ||
  s.addedTo !== null

/**
 * The list holds only what is in the map view right now: the person wants it,
 * and the list is not open as a table. The status counts never follow the map.
 */
export const listFollowsMap = (s: StudioState) => s.onlyInView && !s.tableOpen

export const useStudio = create<StudioState>((set) => ({
  editionId: null,
  status: "all",
  needsDecisionOnly: false,
  onlyInView: true,
  tableOpen: false,
  unknownIn: [],
  companies: [],
  builtFrom: null,
  builtTo: null,
  addedFrom: null,
  addedTo: null,
  layers: defaultLayers,
  query: "",
  searchWholeEdition: false,
  selection: new Set(),
  selectedSectionId: null,
  tool: "select",
  selectedAttribute: null,
  expandedSectionIds: new Set(),
  view: null,
  fit: null,
  agentAttachments: [],
  agentAsked: 0,

  setEdition: (editionId) =>
    set({
      editionId,
      ...selected([]),
      selectedAttribute: null,
      expandedSectionIds: new Set(),
    }),
  setStatus: (status) =>
    set((s) => ({ status: s.status === status ? "all" : status })),
  setNeedsDecisionOnly: (needsDecisionOnly) => set({ needsDecisionOnly }),
  setOnlyInView: (onlyInView) => set({ onlyInView }),
  setTableOpen: (tableOpen) => set({ tableOpen }),
  toggleUnknownIn: (attribute) =>
    set((s) => ({
      unknownIn: s.unknownIn.includes(attribute)
        ? s.unknownIn.filter((a) => a !== attribute)
        : [...s.unknownIn, attribute],
    })),
  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  toggleCompany: (company) =>
    set((s) => ({
      companies: s.companies.includes(company)
        ? s.companies.filter((c) => c !== company)
        : [...s.companies, company],
    })),
  setCompanies: (companies) => set({ companies }),
  setBuilt: (builtFrom, builtTo) => set({ builtFrom, builtTo }),
  setAdded: (addedFrom, addedTo) => set({ addedFrom, addedTo }),
  // Only the filters behind the filter button; the status stays as chosen.
  clearFilters: () =>
    set({
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
  select: (sectionIds) =>
    set({
      ...selected(sectionIds),
      selectedAttribute: null,
    }),
  addToSelection: (sectionIds) =>
    set((s) => ({
      ...selected([...s.selection, ...sectionIds]),
      selectedAttribute: null,
    })),
  toggleSelected: (sectionIds) =>
    set((s) => {
      const next = new Set(s.selection)
      if (sectionIds.every((id) => next.has(id))) {
        sectionIds.forEach((id) => next.delete(id))
      } else {
        sectionIds.forEach((id) => next.add(id))
      }
      const settled = selected(next)
      // The section being read stays open while it is still ticked.
      if (s.selectedSectionId && next.has(s.selectedSectionId)) {
        settled.selectedSectionId = s.selectedSectionId
      }
      return {
        ...settled,
        selectedAttribute:
          settled.selectedSectionId &&
          settled.selectedSectionId === s.selectedSectionId
            ? s.selectedAttribute
            : null,
      }
    }),
  selectSection: (sectionId) =>
    set((s) => ({
      ...selected([sectionId]),
      selectedAttribute: null,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
    })),
  focusSection: (sectionId) =>
    set((s) => ({
      selectedSectionId: sectionId,
      selectedAttribute: null,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
    })),
  selectAttribute: (sectionId, attribute, keep = false) =>
    set((s) => ({
      ...(keep ? { selectedSectionId: sectionId } : selected([sectionId])),
      selectedAttribute: attribute,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
    })),
  closeAttribute: () => set({ selectedAttribute: null }),
  toggleExpanded: (sectionId) =>
    set((s) => {
      const next = new Set(s.expandedSectionIds)
      if (!next.delete(sectionId)) next.add(sectionId)
      return { expandedSectionIds: next }
    }),
  stepBack: (wholeIds) =>
    set((s) => ({
      ...selected(s.selection.size < wholeIds.length ? wholeIds : []),
      selectedAttribute: null,
    })),
  setTool: (tool) => set({ tool }),
  setView: (view) => set({ view }),
  requestFit: (bounds, follow = false) =>
    set(bounds ? { fit: { bounds, nonce: (nonce += 1), follow } } : {}),
  // One attachment per pipeline: adding to a pipeline already attached
  // widens that attachment.
  attachToAgent: (items) =>
    set((s) => ({
      agentAttachments: mergeAttachments(s.agentAttachments, items),
    })),
  askAgent: (items) =>
    set((s) => ({
      agentAttachments: mergeAttachments(s.agentAttachments, items),
      agentAsked: s.agentAsked + 1,
    })),
  detachFromAgent: (pipelineId) =>
    set((s) => ({
      agentAttachments: s.agentAttachments.filter(
        (a) => a.pipelineId !== pipelineId
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
