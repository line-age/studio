import { z } from "zod"

import {
  LIST_KINDS,
  MEMBERSHIPS,
  type ListKind,
  type Membership,
} from "@/data/derive"
import { STATUSES, type SectionStatus } from "@/data/status"

import { useCamera, useStudio } from "./studio-store"

/*
 * The view in the address bar, so a link shows another person the same set:
 * the grouping, the status, the filters, the search, whether the list follows
 * the map, where the map is, and the one section in focus. Not the layout:
 * panel widths, layer switches and Settings stay with each person.
 *
 * Keys are short. A value that cannot be read is dropped, never thrown.
 */

export interface UrlView {
  status: SectionStatus | "all"
  needsDecision: boolean
  query: string
  companies: string[]
  builtFrom: number | null
  builtTo: number | null
  addedFrom: string | null
  addedTo: string | null
  unknownIn: string[]
  memberships: Membership[]
  firstSeenFrom: number | null
  firstSeenTo: number | null
  changedOnly: boolean
  diameters: string[]
  states: string[]
  followMap: boolean
  /** Longitude, latitude and zoom of the map. */
  camera: { lng: number; lat: number; zoom: number } | null
  /** The one section in focus. A selection of several is not carried. */
  section: string | null
  /** How the list is grouped; null leaves it to the data. */
  list: ListKind | null
  /** The pipeline selected as a whole. */
  pipeline: string | null
}

export const DEFAULT_VIEW: UrlView = {
  status: "all",
  needsDecision: false,
  query: "",
  companies: [],
  builtFrom: null,
  builtTo: null,
  addedFrom: null,
  addedTo: null,
  unknownIn: [],
  memberships: [],
  firstSeenFrom: null,
  firstSeenTo: null,
  changedOnly: false,
  diameters: [],
  states: [],
  followMap: true,
  camera: null,
  section: null,
  list: null,
  pipeline: null,
}

const round = (n: number, places: number) => Number(n.toFixed(places))

/** Only what differs from how the screen opens goes in the URL. */
export function toSearchParams(view: UrlView): URLSearchParams {
  const params = new URLSearchParams()
  if (view.status !== "all") params.set("s", view.status)
  if (view.needsDecision) params.set("n", "1")
  if (view.query.trim() !== "") params.set("q", view.query)
  for (const company of view.companies) params.append("co", company)
  if (view.builtFrom !== null || view.builtTo !== null) {
    params.set("b", `${view.builtFrom ?? ""}-${view.builtTo ?? ""}`)
  }
  if (view.addedFrom !== null || view.addedTo !== null) {
    params.set("a", `${view.addedFrom ?? ""}~${view.addedTo ?? ""}`)
  }
  for (const attribute of view.unknownIn) params.append("u", attribute)
  for (const m of view.memberships) params.append("pm", m)
  if (view.firstSeenFrom !== null || view.firstSeenTo !== null) {
    params.set("f", `${view.firstSeenFrom ?? ""}-${view.firstSeenTo ?? ""}`)
  }
  if (view.changedOnly) params.set("ch", "1")
  for (const d of view.diameters) params.append("d", d)
  for (const state of view.states) params.append("st", state)
  if (!view.followMap) params.set("v", "0")
  if (view.camera) {
    const { lng, lat, zoom } = view.camera
    params.set("m", [round(lng, 4), round(lat, 4), round(zoom, 2)].join(","))
  }
  if (view.list) params.set("l", view.list)
  if (view.pipeline) params.set("p", view.pipeline)
  else if (view.section) params.set("sel", view.section)
  return params
}

const status = z.enum(STATUSES)
const year = z.coerce.number().int().min(1000).max(9999)
const day = z.iso.date()
const camera = z.tuple([
  z.coerce.number().min(-180).max(180),
  z.coerce.number().min(-90).max(90),
  z.coerce.number().min(0).max(24),
])

/** `fallback` when the text is empty or does not parse. */
function read<T>(schema: z.ZodType<T>, text: string | undefined): T | null {
  if (text === undefined || text === "") return null
  const parsed = schema.safeParse(text)
  return parsed.success ? parsed.data : null
}

export function fromSearchParams(params: URLSearchParams): UrlView {
  const view: UrlView = { ...DEFAULT_VIEW }
  view.status = read(status, params.get("s") ?? undefined) ?? "all"
  view.needsDecision = params.get("n") === "1"
  view.query = params.get("q") ?? ""
  view.companies = [...new Set(params.getAll("co").filter(Boolean))]
  view.unknownIn = [...new Set(params.getAll("u").filter(Boolean))]
  view.memberships = [
    ...new Set(
      params
        .getAll("pm")
        .filter((m): m is Membership => MEMBERSHIPS.includes(m as Membership))
    ),
  ]
  view.changedOnly = params.get("ch") === "1"
  view.diameters = [...new Set(params.getAll("d").filter(Boolean))]
  view.states = [...new Set(params.getAll("st").filter(Boolean))]
  const seen = params.get("f")?.split("-")
  if (seen?.length === 2) {
    view.firstSeenFrom = read(year, seen[0])
    view.firstSeenTo = read(year, seen[1])
  } else {
    // A link from when an edition was in force ("e=ed-1937") showed the
    // network as of that year: what was first seen up to then.
    view.firstSeenTo = read(year, params.get("e")?.match(/\d{4}$/)?.[0])
  }
  view.followMap = params.get("v") !== "0"
  view.section = params.get("sel") || null
  view.pipeline = params.get("p") || null
  const list = params.get("l")
  view.list = LIST_KINDS.includes(list as ListKind) ? (list as ListKind) : null

  const built = params.get("b")?.split("-")
  if (built?.length === 2) {
    view.builtFrom = read(year, built[0])
    view.builtTo = read(year, built[1])
  }
  const added = params.get("a")?.split("~")
  if (added?.length === 2) {
    view.addedFrom = read(day, added[0])
    view.addedTo = read(day, added[1])
  }
  const at = camera.safeParse(params.get("m")?.split(",") ?? [])
  if (at.success) {
    const [lng, lat, zoom] = at.data
    view.camera = { lng, lat, zoom }
  }
  return view
}

/** The view as the stores hold it now. */
export function currentView(): UrlView {
  const s = useStudio.getState()
  const { zoom, center } = useCamera.getState()
  return {
    status: s.status,
    needsDecision: s.needsDecisionOnly,
    query: s.query,
    companies: [...s.companies],
    builtFrom: s.builtFrom,
    builtTo: s.builtTo,
    addedFrom: s.addedFrom,
    addedTo: s.addedTo,
    unknownIn: [...s.unknownIn],
    memberships: [...s.memberships],
    firstSeenFrom: s.firstSeenFrom,
    firstSeenTo: s.firstSeenTo,
    changedOnly: s.changedOnly,
    diameters: [...s.diameters],
    states: [...s.states],
    followMap: s.onlyInView,
    camera:
      zoom !== null && center !== null
        ? { lng: center[0], lat: center[1], zoom }
        : null,
    section: s.selection.size === 1 ? s.selectedSectionId : null,
    list: s.list,
    pipeline: s.selectedPipelineId,
  }
}

/**
 * Put the view of a URL into the stores. Called once, before the screen
 * draws, so the URL wins over how the screen opens. The section in focus is
 * returned and not selected yet: it is checked against the data first.
 */
export function applyUrl(search: string): UrlView {
  const view = fromSearchParams(new URLSearchParams(search))
  useStudio.setState({
    status: view.status,
    needsDecisionOnly: view.needsDecision,
    query: view.query,
    companies: view.companies,
    builtFrom: view.builtFrom,
    builtTo: view.builtTo,
    addedFrom: view.addedFrom,
    addedTo: view.addedTo,
    unknownIn: view.unknownIn,
    memberships: view.memberships,
    firstSeenFrom: view.firstSeenFrom,
    firstSeenTo: view.firstSeenTo,
    changedOnly: view.changedOnly,
    diameters: view.diameters,
    states: view.states,
    onlyInView: view.followMap,
    list: view.list,
  })
  if (view.camera) {
    useCamera.setState({
      zoom: view.camera.zoom,
      center: [view.camera.lng, view.camera.lat],
    })
  }
  return view
}

function write() {
  const query = toSearchParams(currentView()).toString()
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`
  // replaceState: a filter or a pan is not a step to go back through.
  if (next !== now) window.history.replaceState(window.history.state, "", next)
}

/** How long the map must rest before its place is written, in ms. */
const CAMERA_REST = 300

/**
 * Keep the address bar in step with the view from now on. A filter is
 * written at once; the map's place when it comes to rest. Returns the way
 * to stop.
 */
export function followView(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stopStudio = useStudio.subscribe(write)
  const stopCamera = useCamera.subscribe(() => {
    clearTimeout(timer)
    timer = setTimeout(write, CAMERA_REST)
  })
  return () => {
    clearTimeout(timer)
    stopStudio()
    stopCamera()
  }
}
