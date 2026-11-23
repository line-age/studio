import type { AgentAttachment } from "@/screens/studio/studio-store"

import examples from "./composer-examples.json"

/*
 * What the empty chat's message box writes as its placeholder (Figma section
 * 28, board E): only what the Agent does today, a mix of things to ask and
 * things to do, chosen by what is attached. The same file is the Agent's
 * (agent/contract/composer-examples.json), where a test checks each "do" is
 * read as a change and each "ask" is not; a test here keeps the two one.
 */

export type AttachedKind = "none" | "section" | "sections" | "pipeline"

/** What is attached, as the examples are chosen by it. */
export function attachedKind(
  attachments: readonly AgentAttachment[]
): AttachedKind {
  if (attachments.length === 0) return "none"
  if (attachments.length === 1 && attachments[0].sectionIds === "all")
    return "pipeline"
  const count = attachments.reduce(
    (n, a) => n + (a.sectionIds === "all" ? 2 : a.sectionIds.length),
    0
  )
  return count === 1 ? "section" : "sections"
}

/** The examples for what is attached: asks and does, taken in turn. */
export function examplesFor(attachments: readonly AgentAttachment[]): string[] {
  const { ask, do: does } = examples[attachedKind(attachments)]
  const out: string[] = []
  for (let i = 0; i < Math.max(ask.length, does.length); i++) {
    if (does[i]) out.push(does[i])
    if (ask[i]) out.push(ask[i])
  }
  return out
}
