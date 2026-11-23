import { use, useState } from "react"

import {
  DecisionCard,
  DecisionCardActions,
  DecisionCardDoubt,
  DecisionCardHead,
  DecisionCardLink,
  DecisionCardOutcome,
  DecisionCardProgress,
  DecisionCardRow,
  DecisionCardRows,
} from "@/components/decision-card"
import { Button } from "@/components/ui/button"
import type { SearchOffer } from "@/data/agent/answer"
import { sectionLabel } from "@/data/derive"

import { useStudioData } from "../studio-data"
import { AgentCards } from "./agent-cards"

/*
 * A search of the journals, offered before it runs (Figma section 29, board
 * A). It costs money and minutes, so only Search starts it; Not now and
 * Change towns spend nothing. Change towns puts a sentence in the message box
 * for the person to finish: towns may come only from their own words, store
 * or an earlier finding. While it runs, the same card shows cite's steps and
 * Stop; then it closes with what was read, and what was found follows it.
 */

/** What a search's card says it read: "1931 and 1932". */
export function yearsWords(years: readonly number[]): string {
  if (years.length === 0) return "Nearest the first map that shows it"
  const [from, to] = [years[0], years[years.length - 1]]
  if (from === to) return String(from)
  return to === from + 1 ? `${from} and ${to}` : `${from} to ${to}`
}

const WHO = "A paid search by cite. Takes a few minutes; you can keep working."

export function AgentSearchCard({
  title,
  offer,
}: {
  /** The Agent's words: "Search the journals for the owner". */
  title: string
  offer: SearchOffer
}) {
  const { sectionById } = useStudioData()
  const cards = use(AgentCards)
  const [pressed, setPressed] = useState(false)
  const run = cards.search(offer.id)
  const outcome = cards.outcome(offer.id)
  const section = sectionById.get(offer.section_id)
  const sectionWords = section
    ? section.name
      ? `${section.code} · ${section.name}`
      : sectionLabel(section)
    : offer.section_id.slice(0, 8)
  const towns =
    offer.places.length > 0
      ? offer.places.join(", ")
      : "None. It has no name to search by either."
  const busy = cards.start === null

  const rows = (
    <DecisionCardRows>
      <DecisionCardRow label="Section" code>
        {sectionWords}
      </DecisionCardRow>
      <DecisionCardRow label="Years">{yearsWords(offer.years)}</DecisionCardRow>
      <DecisionCardRow label="Towns">{towns}</DecisionCardRow>
    </DecisionCardRows>
  )

  if (run?.state === "searching" || (pressed && !run)) {
    const working = title.replace(/^Search /, "Searching ")
    return (
      <DecisionCard by="agent" label={working}>
        <DecisionCardHead
          by="agent"
          title={working}
          who="cite is reading the pages. The answer comes here when it is done."
        />
        {rows}
        <DecisionCardProgress
          label="Searching the journals"
          steps={
            run?.state === "searching" && run.steps.length > 0
              ? run.steps
              : ["Starting the search"]
          }
        />
        <DecisionCardActions>
          <Button size="sm" variant="outline" onClick={cards.stop}>
            Stop the search
          </Button>
        </DecisionCardActions>
      </DecisionCard>
    )
  }

  if (run?.state === "done") {
    const found = run.statements.filter((s) => s.kind === "finding").length
    const searched = title.replace(/^Search /, "Searched ")
    return (
      <DecisionCard by="agent" label={searched}>
        <DecisionCardHead
          by="agent"
          title={searched}
          who="A paid search by cite."
        />
        {rows}
        <DecisionCardOutcome tone="done" title="Done">
          {found === 0
            ? "Nothing was found. What was read is below."
            : `Found ${found === 1 ? "1 passage" : `${found} passages`}, below.`}
        </DecisionCardOutcome>
      </DecisionCard>
    )
  }

  const closed =
    run?.state === "stopped"
      ? {
          title: "Stopped",
          detail:
            "The search was stopped. Nothing was found and nothing was written.",
        }
      : run?.state === "refused"
        ? { title: "Not run", detail: run.text }
        : outcome?.state === "declined"
          ? { title: "Not searched", detail: "Ask again when you want it." }
          : null
  if (closed) {
    return (
      <DecisionCard by="closed" label={title}>
        <DecisionCardHead by="closed" title={title} who={WHO} />
        {rows}
        <DecisionCardOutcome tone="closed" title={closed.title}>
          {closed.detail}
        </DecisionCardOutcome>
      </DecisionCard>
    )
  }

  return (
    <DecisionCard by="agent" label={title}>
      <DecisionCardHead by="agent" title={title} who={WHO} />
      {rows}
      {!offer.ready && (
        <DecisionCardDoubt>
          Say a town it runs through or between, in your own words, and I search
          by it.
        </DecisionCardDoubt>
      )}
      <DecisionCardActions
        aside={
          offer.ready ? (
            <DecisionCardLink
              onClick={() =>
                cards.draft(`Search by ${offer.places.join(", ")}`)
              }
            >
              Change towns
            </DecisionCardLink>
          ) : undefined
        }
      >
        <Button
          size="sm"
          disabled={!offer.ready || busy}
          onClick={() => {
            setPressed(true)
            // Not taken (the Agent was busy after all): back to Ready.
            const taken = cards.start?.(offer.id)
            if (taken instanceof Promise)
              void taken.then((ok) => {
                if (!ok) setPressed(false)
              })
          }}
        >
          Search
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void cards.report?.(offer.id, "declined")}
        >
          Not now
        </Button>
      </DecisionCardActions>
    </DecisionCard>
  )
}
