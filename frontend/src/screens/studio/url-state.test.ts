import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCamera, useStudio } from "./studio-store"
import {
  DEFAULT_VIEW,
  applyUrl,
  currentView,
  followView,
  fromSearchParams,
  toSearchParams,
  type UrlView,
} from "./url-state"

const full: UrlView = {
  status: "in-progress",
  needsDecision: true,
  query: "alder gas",
  companies: ["Alder Gas Co.", "Birch & Sons"],
  builtFrom: 1925,
  builtTo: 1940,
  addedFrom: "2026-10-01",
  addedTo: "2026-10-31",
  unknownIn: ["Owner", "Build date"],
  memberships: ["proposed", "none"],
  firstSeenFrom: 1929,
  firstSeenTo: 1937,
  changedOnly: true,
  diameters: ['8"', '12"'],
  states: ["Georgia", "South Carolina"],
  followMap: false,
  camera: { lng: -97.305, lat: 36.412, zoom: 6.37 },
  section: "s-2",
  list: "sections",
  pipeline: null,
}

const parse = (search: string) => fromSearchParams(new URLSearchParams(search))

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
  useCamera.setState(useCamera.getInitialState(), true)
})

afterEach(() => vi.useRealTimers())

describe("the view in the URL", () => {
  it("leaves the URL bare for the view the screen opens on", () => {
    expect(toSearchParams(DEFAULT_VIEW).toString()).toBe("")
    expect(parse("")).toEqual(DEFAULT_VIEW)
  })

  it("carries every field there and back", () => {
    const params = toSearchParams(full)
    expect(fromSearchParams(new URLSearchParams(params.toString()))).toEqual(
      full
    )
    expect([...params.keys()].every((key) => key.length <= 3)).toBe(true)
  })

  it("names the pipeline selected as a whole, in place of a section", () => {
    const view = {
      ...DEFAULT_VIEW,
      list: "pipelines" as const,
      pipeline: "p-1",
    }
    expect(toSearchParams(view).toString()).toBe("l=pipelines&p=p-1")
    expect(parse("l=pipelines&p=p-1")).toEqual(view)
    // A grouping the app does not have is dropped.
    expect(parse("l=tables").list).toBeNull()
  })

  it("opens a link from when an edition was in force as first seen up to it", () => {
    expect(parse("e=ed-1937")).toEqual({ ...DEFAULT_VIEW, firstSeenTo: 1937 })
    // A First seen range of the link's own wins.
    expect(parse("e=ed-1937&f=1929-1931")).toMatchObject({
      firstSeenFrom: 1929,
      firstSeenTo: 1931,
    })
    expect(parse("e=latest")).toEqual(DEFAULT_VIEW)
    // The edition is never written again.
    expect(toSearchParams(parse("e=ed-1937")).toString()).toBe("f=-1937")
  })

  it("carries a range that is open at one end", () => {
    const view = { ...DEFAULT_VIEW, builtFrom: 1930, addedTo: "2026-10-31" }
    expect(parse(toSearchParams(view).toString())).toEqual(view)
  })

  it("drops what it cannot read and keeps the rest", () => {
    expect(
      parse("s=finished&b=abc-19&a=yesterday~&m=900,2&v=maybe&n=yes&q=owner")
    ).toEqual({ ...DEFAULT_VIEW, query: "owner" })
    expect(parse("m=-97.3,36.4,6&s=done").camera).toEqual({
      lng: -97.3,
      lat: 36.4,
      zoom: 6,
    })
  })

  it("puts a link's view into the screen, and reads it back", () => {
    const linked = applyUrl(`?${toSearchParams(full)}`)
    expect(linked.section).toBe("s-2")
    const s = useStudio.getState()
    expect(s.status).toBe("in-progress")
    expect(s.onlyInView).toBe(false)
    expect(s.companies).toEqual(full.companies)
    expect(useCamera.getState().zoom).toBe(6.37)
    // The section is opened later, once the data says it exists.
    expect(s.selection.size).toBe(0)
    expect(currentView()).toEqual({ ...full, section: null })
  })

  it("follows the view without adding steps to the history", () => {
    vi.useFakeTimers()
    const steps = window.history.length
    const stop = followView()

    useStudio.getState().setStatus("done")
    expect(window.location.search).toBe("?s=done")
    useStudio.getState().toggleCompany("Alder Gas Co.")
    expect(window.location.search).toBe("?s=done&co=Alder+Gas+Co.")
    useStudio.getState().selectSection("s-1")
    expect(window.location.search).toContain("sel=s-1")
    // Several sections are not carried.
    useStudio.getState().select(["s-1", "s-2"])
    expect(window.location.search).not.toContain("sel=")

    // The map's place is written once it rests, not on every frame.
    useCamera.getState().setCamera(7, [-97, 36])
    expect(window.location.search).not.toContain("m=")
    vi.advanceTimersByTime(400)
    expect(window.location.search).toContain("m=-97%2C36%2C7")

    expect(window.history.length).toBe(steps)
    stop()
    useStudio.getState().setStatus("all")
    expect(window.location.search).toContain("s=done")
  })
})
