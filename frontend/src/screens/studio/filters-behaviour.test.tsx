import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { SCOPES, type Scope } from "@/data/derive"
import type { Network } from "@/data/schema"
import { testNetwork } from "@/test/network"

import { LeftPanelContext } from "./left-panel-context"
import { PipelinesPanel } from "./panels/pipelines-panel"
import { PropertiesPanel } from "./panels/properties-panel"
import { StudioDataProvider } from "./studio-data"
import { useStudio } from "./studio-store"
import { currentView, fromSearchParams, toSearchParams } from "./url-state"

/*
 * How every filter behaves, through the rendered panels: its chip and the way
 * to take it off, whether it pauses on Pipelines, its group in the Filters
 * panel and its Clear, Clear all, and its words in a link. The table in
 * ../filters drives all of it, so a filter added there is checked here by
 * adding it to FILTERS below.
 *
 * Started as the tests that froze behaviour before the refactoring of
 * 2026-11-22 (workspace AGENTS.md, "How to develop"); the broad snapshots of
 * every header and row were deleted afterwards, these stay as the
 * specification. Not checked here, because this test browser does not open a
 * tooltip: the words a chip shows on hover (`hint` below; the stories show
 * them).
 */

type State = ReturnType<typeof useStudio.getState>

/** Invented people; a real tracer is never named in a test. */
const ANN = { id: "agent-ann", name: "Ann Example" }
const BOB = { id: "agent-bob", name: "Bob Example" }

/** The test network with something for every filter to tell apart. */
function network(): Network {
  const base = testNetwork()
  return {
    ...base,
    sections: base.sections.map((s, i) => ({
      ...s,
      tracedBy: i % 2 === 0 ? ANN : BOB,
      proposedEnds:
        s.id === "s-4"
          ? [
              {
                id: "pe-cut",
                kind: "cut" as const,
                otherSectionId: "gone-9",
                score: 0.6,
                citations: [],
              },
            ]
          : s.id === "s-5"
            ? [
                {
                  id: "pe-end",
                  kind: "end" as const,
                  otherSectionId: "gone-8",
                  score: 0.9,
                  citations: [],
                },
              ]
            : s.proposedEnds,
    })),
  }
}

async function renderPanels(data: Network = network()) {
  const promise = Promise.resolve(data)
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <TooltipProvider>
          <LeftPanelContext
            value={{
              panel: "pipelines",
              open: true,
              openPanel: () => {},
              togglePanel: () => {},
              toggleOpen: () => {},
            }}
          >
            <StudioDataProvider network={promise}>
              <div>
                <PipelinesPanel />
              </div>
              <div>
                <PropertiesPanel />
              </div>
            </StudioDataProvider>
          </LeftPanelContext>
        </TooltipProvider>
      </Suspense>
    )
  })
}

/** Every filter: how it is turned on, its chip, and what "off" looks like. */
const FILTERS: {
  name: string
  on: (s: State) => void
  chip: string
  hint: RegExp
  isOff: (s: State) => boolean
  /** A filter about a section on its own: paused on Pipelines. */
  aboutSection: boolean
  /** The group's title in the Filters panel, where it has a Clear of its own. */
  group: string
  link: string
}[] = [
  {
    name: "status",
    on: (s) => s.setStatus("not-started"),
    chip: "Not started",
    hint: /not started/,
    isOff: (s) => s.status === "all",
    aboutSection: false,
    group: "Status",
    link: "s=not-started",
  },
  {
    name: "needs a decision",
    on: (s) => s.setNeedsDecisionOnly(true),
    chip: "Needs your decision",
    hint: /proposal waiting/,
    isOff: (s) => !s.needsDecisionOnly,
    aboutSection: false,
    group: "Status",
    link: "n=1",
  },
  {
    name: "changed since review",
    on: (s) => s.setChangedOnly(true),
    chip: "Changed since review",
    hint: /changed since a person last reviewed/,
    isOff: (s) => !s.changedOnly,
    aboutSection: false,
    group: "Status",
    link: "ch=1",
  },
  {
    name: "unknown in",
    on: (s) => s.toggleUnknownIn("Diameter"),
    chip: "Unknown diameter",
    hint: /one of these claims is Unknown/,
    isOff: (s) => s.unknownIn.length === 0,
    aboutSection: false,
    group: "Unknown in",
    link: "u=Diameter",
  },
  {
    name: "one company",
    on: (s) => s.setCompanies(["Alder Gas Co."]),
    chip: "Alder Gas Co.",
    hint: /owned by Alder Gas Co\./,
    isOff: (s) => s.companies.length === 0,
    aboutSection: false,
    group: "Company",
    link: "co=Alder+Gas+Co.",
  },
  {
    name: "two companies",
    on: (s) => s.setCompanies(["Alder Gas Co.", "Birch & Sons"]),
    chip: "2 companies",
    hint: /owned by Alder Gas Co\., Birch & Sons/,
    isOff: (s) => s.companies.length === 0,
    aboutSection: false,
    group: "Company",
    link: "co=Alder+Gas+Co.&co=Birch+%26+Sons",
  },
  {
    name: "built between",
    on: (s) => s.setBuilt(1925, 1940),
    chip: "Built 1925 to 1940",
    hint: /built in these years/,
    isOff: (s) => s.builtFrom === null && s.builtTo === null,
    aboutSection: false,
    group: "Build date",
    link: "b=1925-1940",
  },
  {
    name: "built from",
    on: (s) => s.setBuilt(1930, null),
    chip: "Built 1930 or later",
    hint: /built in these years/,
    isOff: (s) => s.builtFrom === null && s.builtTo === null,
    aboutSection: false,
    group: "Build date",
    link: "b=1930-",
  },
  {
    name: "built to",
    on: (s) => s.setBuilt(null, 1940),
    chip: "Built 1940 or earlier",
    hint: /built in these years/,
    isOff: (s) => s.builtFrom === null && s.builtTo === null,
    aboutSection: false,
    group: "Build date",
    link: "b=-1940",
  },
  {
    name: "added",
    on: (s) => s.setAdded("2026-10-01", "2026-10-31"),
    chip: "Added: ",
    hint: /added to Lineage on these days/,
    isOff: (s) => s.addedFrom === null && s.addedTo === null,
    aboutSection: false,
    group: "Added to Lineage",
    link: "a=2026-10-01%7E2026-10-31",
  },
  {
    name: "diameter",
    on: (s) => s.setDiameters(["6 in"]),
    chip: "Diameter 6 in",
    hint: /cited diameters/,
    isOff: (s) => s.diameters.length === 0,
    aboutSection: false,
    group: "Diameter",
    link: "d=6+in",
  },
  {
    name: "first shown by one edition",
    on: (s) => s.setFirstSeenEditions(["ed-1931"]),
    chip: "First shown by the 1931 edition",
    hint: /first shown by the 1931 edition/,
    isOff: (s) => s.firstSeenEditions.length === 0,
    aboutSection: true,
    group: "First shown by",
    link: "fe=ed-1931",
  },
  {
    name: "first shown by two editions",
    on: (s) => s.setFirstSeenEditions(["ed-1931", "ed-1937"]),
    chip: "First shown by 2 editions",
    hint: /the 1931 edition, the 1937 edition/,
    isOff: (s) => s.firstSeenEditions.length === 0,
    aboutSection: true,
    group: "First shown by",
    link: "fe=ed-1931&fe=ed-1937",
  },
  {
    name: "traced by one person",
    on: (s) => s.setTracers([ANN.id]),
    chip: "Traced by Ann Example",
    hint: /traced by Ann Example/,
    isOff: (s) => s.tracers.length === 0,
    aboutSection: true,
    group: "Traced by",
    link: "tb=agent-ann",
  },
  {
    name: "traced by two people",
    on: (s) => s.setTracers([ANN.id, BOB.id]),
    chip: "Traced by 2 people",
    hint: /Ann Example, Bob Example/,
    isOff: (s) => s.tracers.length === 0,
    aboutSection: true,
    group: "Traced by",
    link: "tb=agent-ann&tb=agent-bob",
  },
  {
    name: "one state",
    on: (s) => s.setStates(["Georgia"]),
    chip: "Georgia",
    hint: /run through Georgia/,
    isOff: (s) => s.states.length === 0,
    aboutSection: true,
    group: "State",
    link: "st=Georgia",
  },
  {
    name: "two states",
    on: (s) => s.setStates(["Georgia", "Alabama"]),
    chip: "2 states",
    hint: /run through Georgia, Alabama/,
    isOff: (s) => s.states.length === 0,
    aboutSection: true,
    group: "State",
    link: "st=Georgia&st=Alabama",
  },
  {
    name: "length between",
    on: (s) => s.setLength(5, 500),
    chip: "5 to 500 km",
    hint: /measured along the route/,
    isOff: (s) => s.lengthFrom === null && s.lengthTo === null,
    aboutSection: true,
    group: "Length",
    link: "len=5-500",
  },
  {
    name: "length from",
    on: (s) => s.setLength(100, null),
    chip: "100 km or longer",
    hint: /measured along the route/,
    isOff: (s) => s.lengthFrom === null && s.lengthTo === null,
    aboutSection: true,
    group: "Length",
    link: "len=100-",
  },
  {
    name: "length to",
    on: (s) => s.setLength(null, 50),
    chip: "50 km or shorter",
    hint: /measured along the route/,
    isOff: (s) => s.lengthFrom === null && s.lengthTo === null,
    aboutSection: true,
    group: "Length",
    link: "len=-50",
  },
  {
    name: "proposed end, part",
    on: (s) => s.setProposedEnd(["cut"]),
    chip: "Proposed end: part of it",
    hint: /a tool proposes an end for/,
    isOff: (s) => s.proposedEnd.length === 0,
    aboutSection: true,
    group: "Proposed end",
    link: "pe=cut",
  },
  {
    name: "proposed end, whole or part",
    on: (s) => s.setProposedEnd(["end", "cut"]),
    chip: "Proposed end: the whole section or part of it",
    hint: /a tool proposes an end for/,
    isOff: (s) => s.proposedEnd.length === 0,
    aboutSection: true,
    group: "Proposed end",
    link: "pe=end&pe=cut",
  },
]

const chips = () => screen.queryByRole("group", { name: "Filters in force" })
const turnOn = (filter: (typeof FILTERS)[number]) =>
  act(() => filter.on(useStudio.getState()))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  useStudio.setState(useStudio.getInitialState(), true)
})

describe("filters: each filter's chip", () => {
  it.each(FILTERS)("$name: shown, counted, and taken off", async (filter) => {
    const user = userEvent.setup()
    await renderPanels()
    turnOn(filter)
    const row = chips()!
    expect(row).toHaveTextContent(filter.chip)
    // The filter button says one is on.
    expect(
      screen.getByRole("button", { name: "Filters, 1 is on" })
    ).toHaveAttribute("aria-pressed", "true")
    // One chip, so no "Clear all" beside it.
    expect(within(row).queryByRole("button", { name: "Clear all" })).toBeNull()
    await user.click(
      within(row).getByRole("button", { name: /^Remove the filter: / })
    )
    expect(filter.isOff(useStudio.getState())).toBe(true)
    expect(chips()).toBeNull()
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})

describe("filters: the switch and each filter", () => {
  it.each(FILTERS)(
    "$name: paused on Pipelines or not, and back",
    async (filter) => {
      const user = userEvent.setup()
      await renderPanels()
      turnOn(filter)
      await user.click(screen.getByRole("button", { name: "Pipelines" }))
      if (filter.aboutSection) {
        // Kept, not in force, not shown.
        expect(chips()).toBeNull()
        expect(filter.isOff(useStudio.getState())).toBe(false)
        expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
          "aria-pressed",
          "false"
        )
      } else {
        expect(chips()).toHaveTextContent(filter.chip)
      }
      for (const tab of ["Unplaced", "All"]) {
        await user.click(screen.getByRole("button", { name: tab }))
        expect(chips()).toHaveTextContent(filter.chip)
      }
    }
  )
})

describe("filters: the Filters panel", () => {
  it.each(FILTERS)("$name: its group shows and clears", async (filter) => {
    const user = userEvent.setup()
    await renderPanels()
    turnOn(filter)
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    // On, so its group shows whatever the data can tell apart.
    expect(
      screen.getByRole("region", { name: filter.group })
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: `Clear ${filter.group}` })
    )
    expect(filter.isOff(useStudio.getState())).toBe(true)
  })

  it("clears every filter at once, from the panel and from the chips", async () => {
    const user = userEvent.setup()
    await renderPanels()
    const all = () => FILTERS.every((f) => f.isOff(useStudio.getState()))
    act(() => FILTERS.forEach((f) => f.on(useStudio.getState())))
    expect(all()).toBe(false)
    // Several chips: one "Clear all" beside them.
    await user.click(
      within(chips()!).getByRole("button", { name: "Clear all" })
    )
    expect(all()).toBe(true)

    act(() => FILTERS.forEach((f) => f.on(useStudio.getState())))
    await user.click(screen.getByRole("button", { name: /^Filters/ }))
    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(all()).toBe(true)
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled()
  })

  it("leaves a paused filter alone when the chips are cleared on Pipelines", async () => {
    const user = userEvent.setup()
    await renderPanels()
    act(() => {
      const s = useStudio.getState()
      s.setScope("pipelines")
      s.setFirstSeenEditions(["ed-1931"])
      s.setStatus("done")
      s.setDiameters(["6 in"])
    })
    await user.click(
      within(chips()!).getByRole("button", { name: "Clear all" })
    )
    const s = useStudio.getState()
    expect([s.status, s.diameters.length]).toEqual(["all", 0])
    // The edition filter was not shown, so it was not cleared.
    expect(s.firstSeenEditions).toEqual(["ed-1931"])
  })
})

describe("filters: each filter in a link", () => {
  it.each(FILTERS)("$name: written and read back the same", (filter) => {
    turnOn(filter)
    const written = toSearchParams(currentView()).toString()
    expect(written).toBe(filter.link)
    const read = fromSearchParams(new URLSearchParams(written))
    expect(read).toEqual({ ...currentView(), camera: null })
  })

  it("carries the switch beside any filter", () => {
    for (const scope of SCOPES) {
      act(() => {
        useStudio.setState(useStudio.getInitialState(), true)
        useStudio.getState().setScope(scope as Scope)
        useStudio.getState().setProposedEnd(["cut"])
      })
      const written = toSearchParams(currentView()).toString()
      expect(written).toBe(scope === "all" ? "pe=cut" : `pe=cut&sc=${scope}`)
      expect(fromSearchParams(new URLSearchParams(written)).scope).toBe(scope)
    }
  })
})
