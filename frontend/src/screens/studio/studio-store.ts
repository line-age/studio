import { create } from "zustand"

import type { Bounds, ProposedEndKind, Scope } from "@/data/derive"
import { refKey, type AgentRef, type Question } from "@/data/question"
import type { Claim } from "@/data/schema"
import type { SectionStatus } from "@/data/status"

import {
  ALL_OFF,
  FILTERS,
  filtersInForce,
  sectionFiltersPaused,
} from "./filters"

/*
 * What the person has chosen on the Studio screen. Data lives in the network
 * (src/data); this is only selection and filters.
 */

/** "pipelines" is the list, however it is grouped. */
export type LeftPanel = "pipelines" | "agent"

/**
 * What the map key can switch: the paths a tool proposed, and the sections
 * the filters leave out, drawn faint.
 */
export type LayerId = "proposed" | "faint"

/**
 * "change": one section, moved, taken out or starting a new pipeline.
 * "add": several sections, into a pipeline. "done": what a change came to,
 * or why store refused it, in words.
 */
export type PipelineEdit =
  | { mode: "change" | "add"; sectionIds: readonly string[] }
  | { mode: "done"; text: string; failed: boolean }

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

/** The citation pop-up's open claim and which of its citations is shown. */
export interface OpenCitation {
  sectionId: string
  attribute: string
  citationIndex: number
}

export interface StudioState {
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
  /** Keep sections one of these editions (by id) is the first to show. */
  firstSeenEditions: readonly string[]
  /** Keep sections this long, in km. */
  lengthFrom: number | null
  lengthTo: number | null
  /** Keep sections with a proposed end of one of these kinds waiting. */
  proposedEnd: readonly ProposedEndKind[]
  /** Keep sections one of these people traced, by store's id. */
  tracers: readonly string[]
  /** Keep sections changed since a person last reviewed them. */
  changedOnly: boolean
  /** Keep sections whose cited diameter is one of these. */
  diameters: readonly string[]
  /** Keep sections running through one of these states. */
  states: readonly string[]
  layers: Record<LayerId, boolean>
  query: string
  /** Search past the filters, through everything the switch shows. */
  searchPastFilters: boolean
  /**
   * What the switch above the list shows: every section, only those in a
   * pipeline, or only those in none. The list, the map and the filters
   * offered follow it; the selection does not.
   */
  scope: Scope
  /**
   * The pipeline picked as a whole in the list; null once the
   * selection is changed any other way. Kept so a link can name it.
   */
  selectedPipelineId: string | null
  /** The selected sections. They may belong to several pipelines. */
  selection: ReadonlySet<string>
  /**
   * The selection the "Ask the Agent" bar offers: the one the person just
   * made, on the map or in the list. Any later change retires the bar.
   */
  agentBar: ReadonlySet<string> | null
  /**
   * The one section in focus: the only selected one, or the one opened in
   * the properties panel while several are selected.
   */
  selectedSectionId: string | null
  tool: MapTool
  selectedAttribute: string | null
  expandedSectionIds: ReadonlySet<string>
  /**
   * Goes up each time a section is picked to be read (map, list, search,
   * chat), so the properties panel brings it into view even when it is
   * the same section as before.
   */
  sectionPicked: number
  /** The map's current view; null until the map has drawn once. */
  view: Bounds | null
  fit: FitRequest | null
  agentAttachments: AgentAttachment[]
  /** Claims, sources and proposals attached to the next question. */
  agentRefs: AgentRef[]
  /** Words a starter question put in the message box; null leaves it alone. */
  agentDraft: string | null
  /** Goes up each time something is handed to the Agent; the chat takes focus. */
  agentAsked: number
  /** Questions sent in this visit, each with what was attached to it. */
  sentQuestions: SentQuestion[]
  /**
   * The person is choosing where sections go (Change pipeline, Add to a
   * pipeline), or reading what a change they made came to. Docked at the
   * bottom of the right panel. Not in the URL.
   */
  pipelineEdit: PipelineEdit | null
  /** The citation pop-up: null while closed. */
  openedCitation: OpenCitation | null

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
  setFirstSeenEditions: (editions: readonly string[]) => void
  setLength: (from: number | null, to: number | null) => void
  setProposedEnd: (kinds: readonly ProposedEndKind[]) => void
  setTracers: (tracers: readonly string[]) => void
  setChangedOnly: (on: boolean) => void
  setDiameters: (diameters: readonly string[]) => void
  setStates: (states: readonly string[]) => void
  toggleLayer: (layer: LayerId) => void
  clearFilters: () => void
  /** Turn one filter off, by its key in `FILTERS`. */
  takeOff: (filterKey: string) => void
  setQuery: (query: string) => void
  setSearchPastFilters: (on: boolean) => void
  setScope: (scope: Scope) => void
  /** Bring the pipelines into the list, where the switch leaves them out. */
  showPipelines: () => void
  /** Select exactly these sections; none clears the selection. */
  select: (sectionIds: readonly string[]) => void
  /** Select a pipeline as a whole: these are its sections. */
  selectPipeline: (pipelineId: string, sectionIds: readonly string[]) => void
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
  /** The last hand-over the message box took the cursor for. */
  agentAskFocused: number
  agentAskTaken: () => void
  /** Show the "Ask the Agent" bar for the selection as it is now. */
  offerAgent: () => void
  dismissAgentBar: () => void
  /**
   * Attach, and ask the chat to take the cursor. With `words` a starter
   * question goes in the message box; the person can change it.
   */
  askAgent: (
    items: AgentAttachment[],
    more?: { refs?: readonly AgentRef[]; words?: string }
  ) => void
  detachFromAgent: (pipelineId: string) => void
  detachRef: (key: string) => void
  /** Keep a sent question in the thread and clear what was attached. */
  sendQuestion: (sent: SentQuestion) => void
  /** Empty the composer after a question went to the Agent service. */
  clearAgentDraft: () => void
  /** Open the dock for choosing where sections go, or close it (null). */
  editPipeline: (edit: PipelineEdit | null) => void
  /** Open the citation pop-up at one claim's citation; 0 when not given. */
  openCitation: (
    sectionId: string,
    attribute: string,
    citationIndex?: number
  ) => void
  closeCitation: () => void
  /**
   * Move the pop-up to the next or previous of the section's claims that
   * carries a citation, in `claims` order; arriving at it selects its first
   * citation. Does nothing past the first or the last.
   */
  stepClaim: (claims: readonly Claim[], direction: 1 | -1) => void
  /** Switch the open citation to another of the same claim's citations. */
  selectCitation: (citationIndex: number) => void
}

/** A question as sent, with what the screen needs to show it again. */
export interface SentQuestion {
  question: Question
  attachments: AgentAttachment[]
  refs: AgentRef[]
}

function mergeRefs(had: AgentRef[], refs: readonly AgentRef[]): AgentRef[] {
  const keys = new Set(had.map(refKey))
  return [...had, ...refs.filter((ref) => !keys.has(refKey(ref)))]
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
    // Any other way of selecting is not "this pipeline as a whole".
    selectedPipelineId: null as string | null,
  }
}

const defaultLayers: Record<LayerId, boolean> = {
  proposed: true,
  faint: false,
}

export const LAYERS_KEY = "studio.map-key"

/** The two switches as this browser last left them. */
function readLayers(): Record<LayerId, boolean> {
  try {
    const held = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "{}")
    return {
      proposed:
        typeof held.proposed === "boolean"
          ? held.proposed
          : defaultLayers.proposed,
      faint: typeof held.faint === "boolean" ? held.faint : defaultLayers.faint,
    }
  } catch {
    return defaultLayers
  }
}

function writeLayers(layers: Record<LayerId, boolean>) {
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(layers))
  } catch {
    // Storage blocked or full: the switch holds for this visit only.
  }
}

let nonce = 0

/**
 * True when one of the filters behind the filter button is on, a status or
 * "Needs your decision" among them. "List follows the map" has its own
 * control and does not count.
 */
export const filtersApplied = (s: StudioState) => filtersInForce(s).length > 0

export { sectionFiltersPaused }

/**
 * The list holds only what is in the map view right now: the person wants it,
 * and the list is not open as a table. The status counts never follow the map.
 */
export const listFollowsMap = (s: StudioState) => s.onlyInView && !s.tableOpen

export const useStudio = create<StudioState>((set) => ({
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
  firstSeenEditions: [],
  lengthFrom: null,
  lengthTo: null,
  proposedEnd: [],
  tracers: [],
  changedOnly: false,
  diameters: [],
  states: [],
  layers: readLayers(),
  query: "",
  searchPastFilters: false,
  scope: "all",
  selectedPipelineId: null,
  selection: new Set(),
  agentBar: null,
  selectedSectionId: null,
  tool: "select",
  selectedAttribute: null,
  expandedSectionIds: new Set(),
  sectionPicked: 0,
  view: null,
  fit: null,
  agentAttachments: [],
  agentRefs: [],
  agentDraft: null,
  agentAsked: 0,
  agentAskFocused: 0,
  sentQuestions: [],
  pipelineEdit: null,
  openedCitation: null,

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
    set((s) => {
      const layers = { ...s.layers, [layer]: !s.layers[layer] }
      writeLayers(layers)
      return { layers }
    }),
  toggleCompany: (company) =>
    set((s) => ({
      companies: s.companies.includes(company)
        ? s.companies.filter((c) => c !== company)
        : [...s.companies, company],
    })),
  setCompanies: (companies) => set({ companies }),
  setBuilt: (builtFrom, builtTo) => set({ builtFrom, builtTo }),
  setAdded: (addedFrom, addedTo) => set({ addedFrom, addedTo }),
  setFirstSeenEditions: (firstSeenEditions) => set({ firstSeenEditions }),
  setLength: (lengthFrom, lengthTo) => set({ lengthFrom, lengthTo }),
  setProposedEnd: (proposedEnd) => set({ proposedEnd }),
  setTracers: (tracers) => set({ tracers }),
  setChangedOnly: (changedOnly) => set({ changedOnly }),
  setDiameters: (diameters) => set({ diameters }),
  setStates: (states) => set({ states }),
  // Every filter behind the filter button, the status among them.
  clearFilters: () => set(ALL_OFF),
  takeOff: (filterKey) =>
    set(FILTERS.find((filter) => filter.key === filterKey)?.off ?? {}),
  // A new search starts inside the filters again.
  setQuery: (query) =>
    set((s) => ({
      query,
      searchPastFilters: query.trim() === "" ? false : s.searchPastFilters,
    })),
  setSearchPastFilters: (searchPastFilters) => set({ searchPastFilters }),
  // The selection stays as it is: the switch changes what is shown.
  setScope: (scope) => set({ scope }),
  showPipelines: () =>
    set((s) => (s.scope === "unplaced" ? { scope: "all" } : {})),
  select: (sectionIds) =>
    set((s) => {
      const settled = selected(sectionIds)
      const only = settled.selectedSectionId
      // A lone section (a lasso that caught one) opens, as a click does.
      return only
        ? {
            ...settled,
            selectedAttribute: null,
            expandedSectionIds: new Set(s.expandedSectionIds).add(only),
            sectionPicked: s.sectionPicked + 1,
          }
        : { ...settled, selectedAttribute: null }
    }),
  selectPipeline: (pipelineId, sectionIds) =>
    set({
      ...selected(sectionIds),
      selectedPipelineId: pipelineId,
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
      sectionPicked: s.sectionPicked + 1,
    })),
  focusSection: (sectionId) =>
    set((s) => ({
      selectedSectionId: sectionId,
      selectedAttribute: null,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
      sectionPicked: s.sectionPicked + 1,
    })),
  selectAttribute: (sectionId, attribute, keep = false) =>
    set((s) => ({
      ...(keep ? { selectedSectionId: sectionId } : selected([sectionId])),
      selectedAttribute: attribute,
      expandedSectionIds: new Set(s.expandedSectionIds).add(sectionId),
      // Choosing a claim in the tree keeps the tree where it is.
      sectionPicked: keep ? s.sectionPicked : s.sectionPicked + 1,
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
  agentAskTaken: () => set((s) => ({ agentAskFocused: s.agentAsked })),
  offerAgent: () =>
    set((s) => ({ agentBar: s.selection.size > 0 ? s.selection : null })),
  dismissAgentBar: () => set({ agentBar: null }),
  attachToAgent: (items) =>
    set((s) => ({
      agentAttachments: mergeAttachments(s.agentAttachments, items),
    })),
  askAgent: (items, more = {}) =>
    set((s) => ({
      agentAttachments: mergeAttachments(s.agentAttachments, items),
      agentRefs: mergeRefs(s.agentRefs, more.refs ?? []),
      agentDraft: more.words ?? null,
      agentAsked: s.agentAsked + 1,
    })),
  detachRef: (key) =>
    set((s) => ({
      agentRefs: s.agentRefs.filter((ref) => refKey(ref) !== key),
    })),
  sendQuestion: (sent) =>
    set((s) => ({
      sentQuestions: [...s.sentQuestions, sent],
      agentAttachments: [],
      agentRefs: [],
      agentDraft: null,
    })),
  clearAgentDraft: () =>
    set({ agentAttachments: [], agentRefs: [], agentDraft: null }),
  editPipeline: (edit) => set({ pipelineEdit: edit }),
  detachFromAgent: (pipelineId) =>
    set((s) => ({
      agentAttachments: s.agentAttachments.filter(
        (a) => a.pipelineId !== pipelineId
      ),
    })),
  openCitation: (sectionId, attribute, citationIndex = 0) =>
    set({ openedCitation: { sectionId, attribute, citationIndex } }),
  closeCitation: () => set({ openedCitation: null }),
  stepClaim: (claims, direction) =>
    set((s) => {
      if (!s.openedCitation) return {}
      const cited = claims.filter((c) => c.citations.length > 0)
      const at = cited.findIndex(
        (c) => c.attribute === s.openedCitation!.attribute
      )
      const next = at === -1 ? undefined : cited[at + direction]
      return next
        ? {
            openedCitation: {
              sectionId: s.openedCitation.sectionId,
              attribute: next.attribute,
              citationIndex: 0,
            },
          }
        : {}
    }),
  selectCitation: (citationIndex) =>
    set((s) =>
      s.openedCitation
        ? { openedCitation: { ...s.openedCitation, citationIndex } }
        : {}
    ),
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
