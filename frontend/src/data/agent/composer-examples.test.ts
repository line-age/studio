import { describe, expect, it } from "vitest"

import { attachedKind, examplesFor } from "./composer-examples"
import frontendCopy from "./composer-examples.json"

/* The empty chat's examples, by what is attached. Invented ids. */

const AGENT_COPY = import.meta.glob(
  "../../../../agent/contract/composer-examples.json",
  { eager: true, import: "default" }
)

describe("the examples file", () => {
  it("is the same file the Agent checks its examples against", () => {
    const agentCopy = Object.values(AGENT_COPY)[0]
    expect(agentCopy).toBeDefined()
    expect(frontendCopy).toEqual(agentCopy)
  })
})

describe("examples by what is attached", () => {
  it.each([
    [[], "none"],
    [[{ pipelineId: "p-1", sectionIds: "all" as const }], "pipeline"],
    [[{ pipelineId: "p-1", sectionIds: ["s-1"] }], "section"],
    [[{ pipelineId: "p-1", sectionIds: ["s-1", "s-2"] }], "sections"],
    [
      [
        { pipelineId: "p-1", sectionIds: ["s-1"] },
        { pipelineId: "", sectionIds: ["s-4"] },
      ],
      "sections",
    ],
  ])("%j is %s", (attachments, kind) => {
    expect(attachedKind(attachments)).toBe(kind)
  })

  it("mixes something to do with something to ask, a change first", () => {
    const examples = examplesFor([
      { pipelineId: "p-1", sectionIds: ["s-1", "s-2"] },
    ])
    expect(examples[0]).toBe("Make these one pipeline")
    expect(examples[1]).toBe("Which maps show them?")
    expect(examples).toHaveLength(4)
  })

  it("offers only questions when nothing is attached", () => {
    expect(examplesFor([])).toEqual([
      "What is a section?",
      "Which pipelines have no owner?",
      "How many sections are in no pipeline?",
    ])
  })
})
