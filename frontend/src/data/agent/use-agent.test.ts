import { describe, expect, it } from "vitest"

import { agentAnswer } from "./answer"
import { savedMessage, turnsFrom } from "./use-agent"

// The service's own examples (studio/agent/contract/), so the two sides cannot drift.
const EXAMPLES = import.meta.glob(
  "../../../../agent/contract/examples/*.json",
  {
    eager: true,
    import: "default",
  }
)
const example = (name: string) =>
  structuredClone(
    EXAMPLES[`../../../../agent/contract/examples/${name}.json`]
  ) as Record<string, unknown>

const question = {
  words: "Who owns this section?",
  about: [{ kind: "section", id: "11111111-1111-4111-8111-111111111111" }],
  network: "gas",
}

describe("the answer contract", () => {
  it.each([
    "answer-fact",
    "answer-unknown-with-proposal",
    "answer-refusal",
    "answer-failure",
    "answer-context",
    "answer-citation-request",
  ])("reads the service's example %s", (name) => {
    expect(agentAnswer.safeParse(example(name)).success).toBe(true)
  })
})

describe("turns of the conversation", () => {
  it("pairs each question with the checked answer that names it", () => {
    const turns = turnsFrom([
      {
        id: "q1",
        type: "human",
        content: "Who owns this section?",
        additional_kwargs: { question },
      },
      {
        id: "answer-q1",
        type: "ai",
        content: "",
        additional_kwargs: {
          answer: example("answer-fact"),
          answers: "q1",
          tools: ["read_feature"],
        },
      },
      { id: "q2", type: "human", content: "And now?", additional_kwargs: {} },
    ])
    expect(
      turns.map((t) => [t.id, t.answer?.statements.length ?? null])
    ).toEqual([
      ["q1", 1],
      ["q2", null],
    ])
    expect(turns[0].question.about).toHaveLength(1)
    expect(turns[0].tools).toEqual(["read_feature"])
  })

  it("never shows an answer the service did not check", () => {
    const unchecked = { ...example("answer-fact"), checked: false }
    const turns = turnsFrom([
      {
        id: "q1",
        type: "human",
        content: "?",
        additional_kwargs: { question },
      },
      {
        id: "a",
        type: "ai",
        content: "",
        additional_kwargs: { answer: unchecked, answers: "q1" },
      },
    ])
    expect(turns[0].answer).toBeNull()
  })

  it("does not count a question twice when it comes live and saved", () => {
    const human = {
      id: "q1",
      type: "human",
      content: "?",
      additional_kwargs: { question },
    }
    expect(turnsFrom([human, human])).toHaveLength(1)
  })

  it("reads a message saved as a serialised LangChain object", () => {
    const saved = {
      lc: 1,
      type: "constructor",
      id: ["langchain_core", "messages", "AIMessage"],
      kwargs: {
        id: "answer-q1",
        type: "ai",
        content: "",
        additional_kwargs: { answers: "q1" },
      },
    }
    expect(savedMessage(saved)).toMatchObject({ id: "answer-q1", type: "ai" })
  })
})
