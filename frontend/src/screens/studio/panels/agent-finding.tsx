import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import { createContext, use } from "react"

import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import type { AgentFinding } from "@/data/agent/answer"

/** What became of a Propose, by finding handle, read from the later turns. */
export type ProposeOutcome =
  | { state: "pending" }
  | { state: "proposed"; text: string }
  | { state: "refused"; text: string }

export const ProposeOutcomes = createContext<
  ReadonlyMap<string, ProposeOutcome>
>(new Map())

/*
 * What cite found in a journal, under the sentence that says so. Built from
 * stock parts ahead of a Figma design: the passage in the page's own words,
 * the page with the passage marked, the reference and a link to the page,
 * why it is in doubt, which places it matched, and Propose. It is not in
 * store: the AI badge says so in words. Propose writes it as a candidate claim,
 * which a person still has to accept; nothing else on the card writes. The
 * question and its answer are AI Elements' Confirmation (an Item): what Propose
 * does, the button, and once pressed, what came of it.
 */

/** The part of the page around the passage, with the passage marked. */
function PageCrop({ finding }: { finding: AgentFinding }) {
  const { highlight, image_url, page_width, page_height } = finding
  if (!image_url || !page_width || !page_height || highlight.length === 0)
    return null
  // The same crop cite's own report draws: the passage with a margin round it.
  const x0 = Math.max(0, Math.min(...highlight.map((b) => b.x0)) - 0.05)
  const x1 = Math.min(1, Math.max(...highlight.map((b) => b.x1)) + 0.05)
  const y0 = Math.max(0, Math.min(...highlight.map((b) => b.y0)) - 0.04)
  const y1 = Math.min(1, Math.max(...highlight.map((b) => b.y1)) + 0.04)
  const rw = x1 - x0
  const rh = y1 - y0
  const pct = (n: number) => `${(n * 100).toFixed(4)}%`
  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-border-subtle"
      style={{ aspectRatio: (rw * page_width) / (rh * page_height) }}
    >
      <img
        src={image_url}
        alt={`The page, ${finding.page}`}
        loading="lazy"
        className="absolute max-w-none"
        style={{ width: pct(1 / rw), left: pct(-x0 / rw), top: pct(-y0 / rh) }}
      />
      {highlight.map((b, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute bg-state-note-subtle/60 outline-2 outline-state-note-foreground/60 outline-solid"
          style={{
            left: pct((b.x0 - x0) / rw),
            top: pct((b.y0 - y0) / rh),
            width: pct((b.x1 - b.x0) / rw),
            height: pct((b.y1 - b.y0) / rh),
          }}
        />
      ))}
    </div>
  )
}

const IN_STORE = {
  accepted: "accepted",
  candidate: "a candidate",
  rejected: "rejected",
} as const

function reference(f: AgentFinding): string {
  const issue = f.volume && f.number ? `, vol. ${f.volume} no. ${f.number}` : ""
  return `${f.journal}${issue}, ${f.date}, ${f.page}`
}

const WHAT = {
  owner: "the owner",
  diameter: "the diameter",
  built: "the build date",
}

/** Asks before a finding is written to store, and says what came of it. */
function ProposeConfirmation({
  finding,
  onPropose,
}: {
  finding: AgentFinding
  onPropose?: (handle: string) => void
}) {
  const outcome = use(ProposeOutcomes).get(finding.handle)
  let title: string
  let description: string
  let mark: "check" | "history" | null = null
  let action = false
  if (finding.in_store) {
    title = `In store as ${finding.in_store === "candidate" ? "a candidate" : finding.in_store}`
    description =
      finding.in_store === "candidate"
        ? "Already proposed. A person accepts or rejects it in review."
        : `Store already holds this value, ${finding.in_store}.`
    mark = "check"
  } else if (outcome?.state === "proposed") {
    title = "Proposed"
    description =
      "A candidate claim in store, with this citation. A person decides."
    mark = "check"
  } else if (outcome?.state === "refused") {
    title = "Not proposed"
    description = outcome.text
  } else if (outcome?.state === "pending") {
    title = "Proposing"
    description = "Writing it to store as a candidate claim."
    mark = "history"
  } else if (!finding.proposable) {
    title = "Not offered to propose"
    description = finding.not_proposable ?? ""
  } else {
    title = `Propose this as ${WHAT[finding.attribute]}?`
    description =
      "Writes a candidate claim with this citation to store. A person still accepts or rejects it."
    action = true
  }
  return (
    <Item variant="outline" size="sm" aria-label="Propose to store">
      {mark && (
        <ItemMedia variant="icon">
          <Icon name={mark} />
        </ItemMedia>
      )}
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {action && (
        <ItemActions>
          <Button
            size="sm"
            disabled={!onPropose}
            onClick={() => onPropose?.(finding.handle)}
          >
            Propose
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}

export function AgentFindingCard({
  finding,
  onPropose,
}: {
  finding: AgentFinding
  /** Sends the Propose action; absent while the Agent is busy or offline. */
  onPropose?: (handle: string) => void
}) {
  const doubt = finding.flags.length > 0
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border-subtle p-2.5"
      aria-label={`Finding ${finding.handle}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="ai">
          {finding.in_store
            ? `Found by cite, in store as ${IN_STORE[finding.in_store]}`
            : "Found by cite, not in store"}
        </Badge>
        {doubt && <Badge variant="outline">In doubt</Badge>}
        <span className="type-ui-mono-xs text-muted-foreground">
          {finding.handle}
        </span>
      </div>
      <blockquote className="border-l-2 border-border pl-2 type-ui-sm">
        {finding.quote}
      </blockquote>
      <PageCrop finding={finding} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-ui-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon name="source" className="size-3" />
          {reference(finding)}
        </span>
        <a
          href={finding.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:shadow-focus-ring"
        >
          Open page on Internet Archive
        </a>
      </div>
      {doubt && (
        <ul
          className="flex flex-col gap-0.5 type-ui-xs"
          aria-label="Why it is in doubt"
        >
          {finding.flags.map((f) => (
            <li key={f.flag}>{f.reason}</li>
          ))}
        </ul>
      )}
      {finding.places_matched.length > 0 && (
        <p className="type-ui-xs text-muted-foreground">
          Matched{" "}
          {finding.places_matched
            .map((p) =>
              finding.places_given.includes(p) ? `${p} (you gave it)` : p
            )
            .join(", ")}
          .
        </p>
      )}
      <ProposeConfirmation finding={finding} onPropose={onPropose} />
    </div>
  )
}
