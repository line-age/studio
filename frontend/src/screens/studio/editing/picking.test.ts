import { beforeEach, describe, expect, it } from "vitest"

import { useStudio, type SectionsDraft } from "../studio-store"

/*
 * Pick on the map (Figma 475:17477): the Sections modal's draft as the map
 * changes it. A click on one of the pipeline's own marks it for removal; any
 * other is added; a second click undoes either. Done keeps the picks; Cancel
 * drops only them.
 */

const draft = () => useStudio.getState().editing as SectionsDraft

beforeEach(() => {
  useStudio.setState(useStudio.getInitialState(), true)
  useStudio.getState().edit({
    kind: "sections",
    pipelineId: "p-1",
    add: ["s-4"],
    remove: [],
    picking: null,
  })
})

describe("picking a pipeline's sections on the map", () => {
  it("does nothing to the draft until picking starts", () => {
    useStudio.getState().togglePick("s-3", false)
    expect(draft().add).toEqual(["s-4"])
  })

  it("adds another section, marks one of its own for removal, and undoes either", () => {
    const { startPicking, togglePick } = useStudio.getState()
    startPicking()
    togglePick("s-3", false)
    togglePick("s-1", true)
    expect(draft()).toMatchObject({ add: ["s-4", "s-3"], remove: ["s-1"] })
    togglePick("s-3", false)
    togglePick("s-1", true)
    expect(draft()).toMatchObject({ add: ["s-4"], remove: [] })
  })

  it("keeps the picks on Done, and goes back to the modal", () => {
    const { startPicking, togglePick, stopPicking } = useStudio.getState()
    startPicking()
    togglePick("s-3", false)
    stopPicking(true)
    expect(draft()).toMatchObject({ add: ["s-4", "s-3"], picking: null })
  })

  it("drops only the picks on Cancel: what was found before stays", () => {
    const { startPicking, togglePick, stopPicking } = useStudio.getState()
    startPicking()
    togglePick("s-3", false)
    togglePick("s-1", true)
    stopPicking(false)
    expect(draft()).toMatchObject({ add: ["s-4"], remove: [], picking: null })
  })
})
