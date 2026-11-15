import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { AgentStep } from "@/data/agent/answer"

/*
 * What the Agent did for an answer: its store reads, a search by cite and the
 * check, in plain words (Figma section 13, the chain of thought). Built as AI
 * Elements' Chain of Thought, on the stock Trace: above the answer, open while
 * it works and folded once it is done; the step under way shimmers. It says what
 * was read, never what is true, so it is quiet: small, grey, no state colour.
 * A line from cite's search carries a "cite" badge, as a search result does.
 */

/** "Read 10 sections and 2 pipelines" counts as 12; any other read as one. */
function readsIn(steps: readonly AgentStep[]): number {
  return steps.reduce((sum, step) => {
    const counts = [
      ...step.text.matchAll(/(\d+) (?:sections?|pipelines?|features?)/g),
    ]
    if (step.text.startsWith("Read ") && counts.length > 0)
      return sum + counts.reduce((n, m) => n + Number(m[1]), 0)
    return sum + (step.text.startsWith("Read ") ? 1 : 0)
  }, 0)
}

export function AgentSteps({
  steps,
  working,
}: {
  steps: readonly AgentStep[]
  working: boolean
}) {
  const [opened, setOpened] = useState(false)
  if (steps.length === 0 && !working) return null
  const reads = readsIn(steps)
  const searched = steps.some((step) => step.by === "cite")
  const label = working
    ? searched
      ? "Searching the journals"
      : "Reading store"
    : searched
      ? "Searched the journals"
      : reads === 0
        ? "Wrote and checked the answer"
        : `Read ${reads} ${reads === 1 ? "thing" : "things"} in store`
  const open = working || opened
  return (
    <TraceCollapsible
      open={open}
      onOpenChange={(next) => setOpened(next)}
      disabled={working}
    >
      <TraceCollapsibleTrigger>
        <TraceLine status={working ? "running" : undefined}>
          <TraceIcon>
            <Icon name="search" />
          </TraceIcon>
          <TraceTitle>{label}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace role="list" aria-label="What the Agent did">
          {steps.map((step, i) => (
            <div key={i} role="listitem">
              <TraceLine status={step.done ? undefined : "running"}>
                <TraceIcon>
                  <Icon name={step.done ? "check" : "history"} />
                </TraceIcon>
                {step.by === "cite" && <Badge variant="secondary">cite</Badge>}
                <TraceTitle>{step.text}</TraceTitle>
              </TraceLine>
            </div>
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
