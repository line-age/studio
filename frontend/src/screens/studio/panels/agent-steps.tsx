import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AgentStep } from "@/data/agent/answer"

/*
 * What the Agent did for an answer: its store reads and its check, in plain
 * words (Figma section 13, the chain of thought). Above the answer, open while
 * it works and folded once it is done. It says what was read, never what is
 * true, so it is quiet: small, grey, no state colour.
 */

/** "Read 10 sections and 2 pipelines" counts as 12; any other read as one. */
function readsIn(steps: readonly AgentStep[]): number {
  return steps.reduce((sum, step) => {
    const many = /^Read (\d+) sections(?: and (\d+) pipelines)?$/.exec(
      step.text
    )
    if (many) return sum + Number(many[1]) + Number(many[2] ?? 0)
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
  const label = working
    ? "Reading store"
    : `Read ${reads} ${reads === 1 ? "thing" : "things"} in store`
  const open = working || opened
  return (
    <Collapsible open={open} onOpenChange={setOpened}>
      <CollapsibleTrigger
        className="flex items-center gap-1.5 rounded-sm type-ui-sm-medium text-muted-foreground outline-none hover:text-foreground focus-visible:shadow-focus-ring"
        disabled={working}
      >
        <Icon name="search" className="size-3.5" />
        {label}
        <Icon
          name={open ? "chevron-down" : "chevron-right"}
          className="size-3.5"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol
          aria-label="What the Agent did"
          className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l pl-3"
        >
          {steps.map((step, i) => (
            <li
              key={i}
              className={
                step.done
                  ? "flex items-center gap-1.5 type-ui-xs text-muted-foreground"
                  : "flex items-center gap-1.5 type-ui-xs text-foreground"
              }
            >
              <Icon
                name={step.done ? "check" : "history"}
                className="size-3 shrink-0"
              />
              {step.text}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}
