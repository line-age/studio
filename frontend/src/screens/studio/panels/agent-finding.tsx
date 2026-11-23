import { createContext, use, useState } from "react"

import {
  DecisionCard,
  DecisionCardActions,
  DecisionCardDoubt,
  DecisionCardHead,
  DecisionCardLink,
  DecisionCardOutcome,
  DecisionCardRow,
  DecisionCardRows,
  type DecisionTone,
} from "@/components/decision-card"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { AgentFinding } from "@/data/agent/answer"
import { sectionLabel } from "@/data/derive"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { AgentCards } from "./agent-cards"

/** What became of a Propose, by finding handle, read from the later turns. */
export type ProposeOutcome =
  | { state: "pending" }
  | { state: "proposed"; text: string }
  | { state: "refused"; text: string }

export const ProposeOutcomes = createContext<
  ReadonlyMap<string, ProposeOutcome>
>(new Map())

/**
 * The pipeline a section is confirmed part of, by name, or null. An owner
 * belongs to the pipeline, so a finding of one is offered for it there.
 */
export const PipelineOfSection = createContext<
  (sectionId: string) => { id: string; name: string } | null
>(() => null)

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

const IN_STORE_WORDS = {
  accepted: "Already in store, accepted",
  candidate: "Already proposed",
  rejected: "Already in store, rejected",
} as const

function reference(f: AgentFinding): string {
  const issue = f.volume && f.number ? `, vol. ${f.volume} no. ${f.number}` : ""
  return `${f.journal}${issue}, ${f.page} · ${f.date}`
}

/** The card's title: what was found, as a fact would read. */
function titleOf(f: AgentFinding): string {
  if (f.attribute === "owner") return `Owner: ${f.value}`
  if (f.attribute === "diameter") return `Diameter: ${f.value}`
  return `Built: ${f.date_words}`
}

/** The page with the passage marked, in a pop-up beside the card. */
function ShowThePage({ finding }: { finding: AgentFinding }) {
  if (!finding.image_url || finding.highlight.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="rounded-sm type-ui-xs-medium text-link underline-offset-2 outline-none hover:underline focus-visible:shadow-focus-ring"
          />
        }
      >
        Show the page
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <PageCrop finding={finding} />
      </PopoverContent>
    </Popover>
  )
}

/*
 * What cite found in a journal, as one card (Figma section 29, board B): the
 * value as the title, the page's own words, the source, and where it would
 * go. Propose writes a candidate claim, never an accepted one; the card then
 * points to the inbox, where a person decides it. An owner goes to the
 * section's pipeline unless the person says this section only. Dismiss
 * writes nothing and is kept in the thread.
 */
export function AgentFindingCard({
  finding,
  onPropose,
}: {
  finding: AgentFinding
  /** Sends the Propose action; absent while the Agent is busy or offline. */
  onPropose?: (handle: string, target?: string) => void
}) {
  const outcome = use(ProposeOutcomes).get(finding.handle)
  const cards = use(AgentCards)
  const openInbox = useStudio((s) => s.openInbox)
  const { sectionById } = useStudioData()
  const pipelineOf = use(PipelineOfSection)
  const pipeline =
    finding.attribute === "owner" ? pipelineOf(finding.section_id) : null
  const [sectionOnly, setSectionOnly] = useState(false)
  const toPipeline = pipeline !== null && !sectionOnly
  const dismissed = cards.outcome(finding.handle)?.state === "dismissed"
  const section = sectionById.get(finding.section_id)
  const doubt = finding.flags.map((f) => f.reason).join(" ")
  const title = titleOf(finding)
  const closed = dismissed
  const by = closed ? "closed" : "agent"

  let shown: {
    tone: DecisionTone
    title: string
    detail?: string
    inbox?: boolean
  } | null = null
  if (dismissed)
    shown = {
      tone: "closed",
      title: "Dismissed",
      detail: "Nothing was written. It stays in this chat.",
    }
  else if (finding.in_store)
    shown = {
      tone: "closed",
      title: IN_STORE_WORDS[finding.in_store],
      detail:
        finding.in_store === "candidate"
          ? "Proposed earlier, with this page. A person decides it in the inbox."
          : "Nothing new to propose.",
      inbox: finding.in_store === "candidate",
    }
  else if (outcome?.state === "proposed")
    shown = {
      tone: "proposed",
      title: "Proposed",
      detail: outcome.text,
      inbox: true,
    }
  else if (outcome?.state === "refused")
    shown = { tone: "closed", title: "Not proposed", detail: outcome.text }
  else if (!finding.proposable)
    shown = {
      tone: "closed",
      title: "Not offered to propose",
      detail: finding.not_proposable ?? undefined,
    }

  const busy = !onPropose || cards.report === null
  const links = (
    <span className="flex items-center gap-3">
      {pipeline && shown === null && outcome?.state !== "pending" && (
        <DecisionCardLink onClick={() => setSectionOnly((v) => !v)}>
          {sectionOnly ? `To ${pipeline.name}` : "This section only"}
        </DecisionCardLink>
      )}
      <ShowThePage finding={finding} />
    </span>
  )

  return (
    <DecisionCard by={by} label={`Finding ${finding.handle}: ${title}`}>
      <DecisionCardHead
        by={by}
        title={title}
        who={
          toPipeline
            ? "Found by cite, not saved. An owner belongs to the pipeline, so Propose sends it there."
            : "Found by cite, not saved. Propose sends it to be decided."
        }
        aside={
          <DecisionCardLink href={finding.url}>Open page</DecisionCardLink>
        }
      />
      <DecisionCardRows>
        <DecisionCardRow label="Section" code>
          {section ? sectionLabel(section) : finding.section_id.slice(0, 8)}
        </DecisionCardRow>
        {toPipeline && (
          <DecisionCardRow label="Goes to" code>
            {pipeline.name}
          </DecisionCardRow>
        )}
        <DecisionCardRow label="Page says">“{finding.quote}”</DecisionCardRow>
        <DecisionCardRow label="Source">{reference(finding)}</DecisionCardRow>
        {finding.places_matched.length > 0 && (
          <DecisionCardRow label="Matched">
            {finding.places_matched
              .map((p) =>
                finding.places_given.includes(p) ? `${p} (you gave it)` : p
              )
              .join(", ")}
          </DecisionCardRow>
        )}
      </DecisionCardRows>
      {doubt && <DecisionCardDoubt>In doubt: {doubt}</DecisionCardDoubt>}
      {shown && (
        <DecisionCardOutcome tone={shown.tone} title={shown.title}>
          {shown.detail}
        </DecisionCardOutcome>
      )}
      {shown?.inbox && (
        <DecisionCardActions>
          <Button size="sm" variant="outline" onClick={openInbox}>
            Open in inbox
          </Button>
        </DecisionCardActions>
      )}
      {shown === null && (
        <DecisionCardActions aside={links}>
          {outcome?.state === "pending" ? (
            <Button size="sm" disabled>
              Proposing
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  onPropose?.(
                    finding.handle,
                    toPipeline ? pipeline.id : undefined
                  )
                }
              >
                Propose
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void cards.report?.(finding.handle, "dismissed")}
              >
                Dismiss
              </Button>
            </>
          )}
        </DecisionCardActions>
      )}
      {shown !== null && !shown.inbox && !closed && !finding.proposable && (
        <DecisionCardActions>
          <Button
            size="sm"
            variant="ghost"
            disabled={cards.report === null}
            onClick={() => void cards.report?.(finding.handle, "dismissed")}
          >
            Dismiss
          </Button>
        </DecisionCardActions>
      )}
    </DecisionCard>
  )
}
