import { use } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import type { AgentStatement } from "@/data/agent/answer"
import { cn } from "@/lib/utils"

import { AgentCards, CardQuestion } from "./agent-cards"

/*
 * A fixed line, written by code (Figma section 28 board C 5; section 29
 * board C): an icon, what happened, what it means, and at most one way on.
 * A refusal or something the Agent cannot do yet, a failure, a search that
 * found nothing. A way on that would search again puts words in the box for
 * the person to finish; it never starts a paid run by itself.
 */

/** The kinds drawn as a notice. */
export const NOTICE_KINDS: ReadonlySet<AgentStatement["kind"]> = new Set([
  "refusal",
  "failure",
  "not_yet",
  "searched",
])

/** "Searched, not found: ..." and "The search could not finish" are cite's. */
function isNotFound(statement: AgentStatement): boolean {
  return (
    statement.kind === "searched" &&
    statement.text.startsWith("Searched, not found")
  )
}

/** The line split at its first sentence: what happened, then what it means. */
export function splitLine(text: string): [string, string | null] {
  const match = /^(.+?[.?!])\s+(.+)$/s.exec(text)
  return match ? [match[1], match[2]] : [text, null]
}

export function AgentNotice({ statement }: { statement: AgentStatement }) {
  const cards = use(AgentCards)
  const question = use(CardQuestion)
  const failed =
    statement.kind === "failure" ||
    (statement.kind === "searched" && !isNotFound(statement))
  const icon: IconName =
    statement.kind === "searched" && !failed
      ? "search"
      : failed
        ? "warning"
        : "close"
  const [line, more] = splitLine(statement.text)
  return (
    <div className="flex items-start gap-2" data-kind={statement.kind}>
      <span className="flex h-5 shrink-0 items-center">
        <Icon
          name={icon}
          className={cn(
            "size-3.5",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 break-words">
        <p className="type-ui-sm">{line}</p>
        {more && <p className="type-ui-xs text-muted-foreground">{more}</p>}
        {statement.kind === "failure" && question && cards.ask && (
          <div className="pt-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => cards.ask?.(question)}
            >
              Try again
            </Button>
          </div>
        )}
        {isNotFound(statement) && (
          <div className="flex flex-wrap gap-1 pt-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => cards.draft("Search other years: from ")}
            >
              Search other years
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cards.draft("Search by ")}
            >
              Change towns
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
