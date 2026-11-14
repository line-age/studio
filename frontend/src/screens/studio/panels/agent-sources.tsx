import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

/*
 * Every source an answer rests on, once each, folded at its end ("Used 2
 * sources", Figma section 13). A source opens the claim it was cited for.
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
    <Collapsible open={opened} onOpenChange={setOpened}>
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-sm type-ui-sm-medium text-muted-foreground outline-none hover:text-foreground focus-visible:shadow-focus-ring">
        <Icon name="source" className="size-3.5" />
        Used {sources.size} {sources.size === 1 ? "source" : "sources"}
        <Icon
          name={opened ? "chevron-down" : "chevron-right"}
          className="size-3.5"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul aria-label="Sources" className="mt-2 flex flex-col gap-1">
          {[...sources].map(([source, ref]) => (
            <li key={source}>
              <button
                type="button"
                onClick={() => open(ref)}
                className="flex items-center gap-1.5 rounded-sm text-left type-ui-xs text-muted-foreground outline-none hover:text-foreground focus-visible:shadow-focus-ring"
              >
                <Icon name="source" className="size-3 shrink-0" />
                {source}
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
