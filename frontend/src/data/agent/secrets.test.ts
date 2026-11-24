import { describe, expect, it } from "vitest"

import { redact } from "./secrets"
import frontendCopy from "./secret-patterns.json"
import { questionMessage } from "./use-agent"

/* A key pasted into the chat never leaves the browser. Invented examples only, kept in
 * two parts in the file so that no file holds a whole one. */

const examples = frontendCopy.redacted.map(
  (e) =>
    [
      e.before + e.secret.join("") + e.after,
      e.before + frontendCopy.mark + e.after,
    ] as const
)

const AGENT_COPY = import.meta.glob(
  "../../../../agent/contract/secret-patterns.json",
  { eager: true, import: "default" }
)

describe("the patterns file", () => {
  it("is the same file the Agent redacts with", () => {
    const agentCopy = Object.values(AGENT_COPY)[0]
    expect(agentCopy).toBeDefined()
    expect(frontendCopy).toEqual(agentCopy)
  })
})

describe("redacting what a person types", () => {
  it.each(examples)("replaces the secret in %j", (sent, kept) => {
    expect(redact(sent)).toBe(kept)
  })

  it.each(frontendCopy.kept)("leaves %j as typed", (words) => {
    expect(redact(words)).toBe(words)
  })

  it("redacts every secret in the words, not only the first", () => {
    const one = examples[1][0]
    expect(redact(`${one} and ${one}`)).toBe(
      `${frontendCopy.mark} and ${frontendCopy.mark}`
    )
  })
})

describe("the message a question is sent as", () => {
  it("carries the words with the secret replaced, in both places", () => {
    const [sent, kept] = examples[0]
    const message = questionMessage(
      { words: sent, about: [], network: "gas" },
      "m-1"
    )
    expect(message.content).toBe(kept)
    expect(message.additional_kwargs.question.words).toBe(kept)
    expect(JSON.stringify(message)).not.toContain(sent.split(" ")[4])
  })
})
