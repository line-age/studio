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

const IN_STORE_WORDS = {
  accepted: "Already accepted",
  candidate: "Already proposed",
  rejected: "Already rejected",
} as const

/** Where it was found: the document, then the source it is held by. */
function reference(f: AgentFinding): string {
  return `${f.title} · ${f.source}`
}

/** "0.85, 4 of 5 checks": the number is a count of checks, never a chance. */
function confidenceWords(f: AgentFinding): string {
  const passed = f.checks.filter((c) => c.passed).length
  const score = f.confidence.toFixed(2)
  return f.checks.length === 0
    ? score
    : `${score}, ${passed} of ${f.checks.length} checks`
}

/** The card's title: what was found, as a fact would read. */
function titleOf(f: AgentFinding): string {
  if (f.attribute === "owner") return `Owner: ${f.value}`
  if (f.attribute === "diameter") return `Diameter: ${f.value}`
  return `Built: ${f.date_words}`
}

/*
 * What cite found in a source, as one card (Figma section 29, board B, without
 * the page image: cite reads text only): the value as the title, the page's
 * own words, the source, how sure it is and why, and where it would go. A
 * lead scored below what a finding needs: it is shown with its link and is
 * never proposed. Propose writes a candidate claim, never an accepted one; the card then
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
      title: finding.lead
        ? "A lead, not offered to propose"
        : "Not offered to propose",
      detail: finding.not_proposable ?? undefined,
    }

  const busy = !onPropose || cards.report === null
  const links =
    pipeline && shown === null && outcome?.state !== "pending" ? (
      <DecisionCardLink onClick={() => setSectionOnly((v) => !v)}>
        {sectionOnly ? `To ${pipeline.name}` : "This section only"}
      </DecisionCardLink>
    ) : undefined
  const passed = finding.checks.filter((c) => c.passed)
  const notPassed = finding.checks.filter((c) => !c.passed)

  return (
    <DecisionCard by={by} label={`Finding ${finding.handle}: ${title}`}>
      <DecisionCardHead
        by={by}
        title={title}
        who={
          finding.lead
            ? "A lead found by cite, not saved. Too little ties it to this section to propose it."
            : toPipeline
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
        <DecisionCardRow label="How sure">
          {confidenceWords(finding)}
        </DecisionCardRow>
        {passed.length > 0 && (
          <DecisionCardRow label="Passed">
            {passed.map((c) => c.label).join(". ")}.
          </DecisionCardRow>
        )}
        {notPassed.length > 0 && (
          <DecisionCardRow label="Missing">
            {notPassed.map((c) => c.label).join(". ")}.
          </DecisionCardRow>
        )}
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
