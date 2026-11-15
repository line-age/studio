import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

/*
 * Every source an answer rests on, once each, folded at its end ("Used 2
 * sources", Figma section 13). Built as AI Elements' Sources, on the stock
 * Trace. A source opens the claim it was cited for.
 */
export function AgentSources({
  statements,
  open,
}: {
  statements: readonly AgentStatement[]
  open: (ref: AgentAnswerRef) => void
}) {
  const [opened, setOpened] = useState(false)
  const sources = new Map<string, AgentAnswerRef>()
  for (const statement of statements)
    for (const ref of statement.refs)
      if (ref.type === "claim" && ref.source && !sources.has(ref.source))
        sources.set(ref.source, ref)
  if (sources.size === 0) return null
  return (
    <TraceCollapsible open={opened} onOpenChange={(next) => setOpened(next)}>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <Icon name="source" />
          </TraceIcon>
          <TraceTitle>
            Used {sources.size} {sources.size === 1 ? "source" : "sources"}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace role="list" aria-label="Sources">
          {[...sources].map(([source, ref]) => (
            <div key={source} role="listitem">
              <button
                type="button"
                onClick={() => open(ref)}
                className="rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <TraceLine>
                  <TraceIcon>
                    <Icon name="source" />
                  </TraceIcon>
                  <TraceTitle>{source}</TraceTitle>
                </TraceLine>
              </button>
            </div>
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
