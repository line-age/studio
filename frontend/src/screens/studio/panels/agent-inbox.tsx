import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Icon } from "@/components/icons/icon"
import { ProposalCard } from "@/components/proposal-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { detailOf, requestDetails, useDetails } from "@/data/detail-store"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  proposedPipelines,
  type Change,
  type PipelineDecision,
  type ProposalAt,
} from "@/data/changes"
import { pipelineLabel, sectionLabel } from "@/data/derive"
import { citationLine, proposedEndWords } from "@/data/evidence"
import type {
  Claim,
  Network,
  Proposal,
  ProposedEnd,
  Section,
} from "@/data/schema"
import { actionKey, WriteError } from "@/data/store/write"

import { useStudioData } from "../studio-data"

/*
 * The Agent as an inbox of what tools proposed (Figma `216:9658`): proposed
 * pipelines, proposed ends and cuts, and candidate claims (cite's findings
 * the person proposed among them). No model is involved: the list is read
 * from the network, and each decision is the person's, sent to store on its
 * button. A proposed pipeline is decided whole; a section already in another
 * pipeline stays there. A proposed cut is shown and cannot be decided here.
 */

const PAGE = 20

type Item =
  | { kind: "pipeline"; key: string; decision: PipelineDecision }
  | { kind: "end"; key: string; section: Section; end: ProposedEnd }
  | {
      kind: "claim"
      key: string
      at: ProposalAt
      name: string
      now: string | null
      proposal: Proposal
    }

/** The sections with something waiting on them: an end, a cut, a candidate. */
export function waitingSections(network: Network): Section[] {
  return network.sections.filter(
    (s) => s.proposedEnds.length > 0 || s.values.some((v) => v.proposals > 0)
  )
}

/** How many proposals wait, from what the list holds: no section's detail needed. */
export function inboxCount(network: Network): number {
  return (
    proposedPipelines(network).length +
    network.pipelines.reduce(
      (n, p) => n + p.claims.reduce((m, c) => m + c.proposals.length, 0),
      0
    ) +
    network.sections.reduce(
      (n, s) =>
        n +
        s.proposedEnds.length +
        s.values.reduce((m, v) => m + v.proposals, 0),
      0
    )
  )
}

/**
 * Everything waiting for a person, pipelines first. A section's ends and
 * candidates come with its detail: a section not read yet is left out.
 */
export function inboxItems(network: Network): Item[] {
  const items: Item[] = proposedPipelines(network).map((decision) => ({
    kind: "pipeline",
    key: `pipeline:${decision.pipeline.id}`,
    decision,
  }))
  // A detail read before the last write may still hold what was decided
  // since: only what the network, read after it, still has waiting is shown.
  for (const section of network.sections) {
    const open = new Set(section.proposedEnds.map((e) => e.id))
    for (const end of detailOf(section)?.proposedEnds ?? [])
      if (open.has(end.id))
        items.push({ kind: "end", key: `end:${end.id}`, section, end })
  }
  const claimsOf = (
    owner: "section" | "pipeline",
    id: string,
    name: string,
    claims: readonly Claim[]
  ) => {
    for (const claim of claims)
      claim.proposals.forEach((proposal, index) =>
        items.push({
          kind: "claim",
          key: `claim:${owner}:${id}:${claim.attribute}:${proposal.id ?? index}`,
          at: {
            owner,
            ownerId: id,
            attribute: claim.attribute,
            index,
            ...(proposal.id ? { id: proposal.id } : {}),
          },
          name,
          now: claim.value,
          proposal,
        })
      )
  }
  for (const pipeline of network.pipelines)
    claimsOf("pipeline", pipeline.id, pipelineLabel(pipeline), pipeline.claims)
  for (const section of network.sections)
    claimsOf(
      "section",
      section.id,
      sectionLabel(section),
      (detailOf(section)?.claims ?? []).filter(
        (c) =>
          (section.values.find((v) => v.attribute === c.attribute)?.proposals ??
            0) > 0
      )
    )
  return items
}

export function AgentInbox() {
  const { network } = useStudioData()
  const [shown, setShown] = useState(PAGE)
  const total = inboxCount(network)
  // A section's proposals come with its detail: read when the inbox opens.
  const waiting = useMemo(() => waitingSections(network), [network])
  const read = useDetails((s) => s.entries)
  const generation = useDetails((s) => s.generation)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open) requestDetails(waiting.map((s) => s.id))
  }, [open, waiting, generation])
  const items = useMemo(
    () => inboxItems(network),
    // `read` changes as details arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network, read]
  )
  const pending = waiting.filter((s) => detailOf(s) === null).length
  if (total === 0) return null
  const count = `${total} ${total === 1 ? "proposal" : "proposals"} waiting`
  return (
    <Collapsible
      className="flex min-h-0 shrink-0 flex-col border-b"
      open={open}
      onOpenChange={setOpen}
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-left type-ui-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Icon name="history" className="size-3.5" />
        <span className="flex-1">{count}</span>
        <span className="type-ui-xs text-muted-foreground">Decide</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="max-h-[50vh] overflow-y-auto overscroll-contain">
        {pending > 0 && (
          <div
            aria-label="Reading proposals"
            className="flex flex-col gap-2 px-3 pt-3"
          >
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        <ul aria-label="Proposals waiting" className="flex flex-col gap-4 p-3">
          {items.slice(0, shown).map((item) => (
            <li key={item.key} className="flex flex-col gap-2">
              <InboxItem item={item} />
            </li>
          ))}
        </ul>
        {items.length > shown && (
          <div className="px-3 pb-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShown((n) => n + PAGE)}
            >
              Show {Math.min(PAGE, items.length - shown)} more
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function InboxItem({ item }: { item: Item }) {
  switch (item.kind) {
    case "pipeline": {
      const { decision } = item
      const n = decision.proposed.length
      const confirms = decision.confirms.length
      const by = decision.proposed.find((p) => p.proposer)?.proposer
      const scores = decision.proposed.map((p) => p.score)
      const detail = [
        decision.placed.length > 0
          ? `Confirms ${confirms} ${confirms === 1 ? "section" : "sections"}. ${decision.placed.length} ${decision.placed.length === 1 ? "is" : "are"} already in another pipeline and ${decision.placed.length === 1 ? "stays" : "stay"} there.`
          : `${n} ${n === 1 ? "section" : "sections"}.`,
        scores.some((s) => s > 0)
          ? `Best score ${Math.max(...scores).toFixed(2)}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
      return (
        <>
          <p className="type-ui-sm">
            {n} {n === 1 ? "section" : "sections"} could be one pipeline.
          </p>
          <ProposalCard
            now="Not in a pipeline"
            proposed={pipelineLabel(decision.pipeline)}
            evidence={detail}
            by={by ? `the ${by} tool` : undefined}
          >
            <Decide
              confirm={
                confirms === 0
                  ? null
                  : {
                      label:
                        confirms === n
                          ? `Confirm all ${n}`
                          : `Confirm ${confirms}`,
                      change: {
                        kind: "decide-pipeline",
                        pipelineId: decision.pipeline.id,
                        verdict: "confirm",
                      },
                    }
              }
              reject={{
                label: "Reject all",
                change: {
                  kind: "decide-pipeline",
                  pipelineId: decision.pipeline.id,
                  verdict: "reject",
                },
              }}
            />
          </ProposalCard>
        </>
      )
    }
    case "end": {
      const { section, end } = item
      return (
        <>
          <p className="type-ui-sm">
            {sectionLabel(section)}:{" "}
            {end.kind === "end"
              ? "a later map no longer shows it."
              : "a later map no longer shows part of it."}
          </p>
          <ProposalCard
            now={null}
            proposed={end.kind === "end" ? "Ends" : "Cut in two"}
            evidence={proposedEndWords(end)}
            by={end.proposer ? `the ${end.proposer} tool` : undefined}
          >
            {end.kind === "end" ? (
              <Decide
                confirm={{
                  label: "Confirm",
                  change: {
                    kind: "decide-end",
                    sectionId: section.id,
                    endId: end.id,
                    verdict: "confirm",
                  },
                }}
                reject={{
                  label: "Reject",
                  change: {
                    kind: "decide-end",
                    sectionId: section.id,
                    endId: end.id,
                    verdict: "reject",
                  },
                }}
              />
            ) : (
              <p className="type-ui-xs text-muted-foreground">
                A cut cannot be decided here yet.
              </p>
            )}
          </ProposalCard>
        </>
      )
    }
    case "claim":
      return (
        <>
          <p className="type-ui-sm">
            {item.at.attribute} of {item.name}
          </p>
          <ProposalCard
            now={item.now}
            proposed={item.proposal.value}
            evidence={citationLine(item.proposal.citation)}
          >
            <Decide
              confirm={{
                label: "Accept",
                change: {
                  kind: "decide-claim",
                  at: item.at,
                  verdict: "confirm",
                },
              }}
              reject={{
                label: "Reject",
                change: {
                  kind: "decide-claim",
                  at: item.at,
                  verdict: "reject",
                },
              }}
            />
          </ProposalCard>
        </>
      )
  }
}

/** The two buttons of a decision. Nothing shows as done until store says so. */
function Decide({
  confirm,
  reject,
}: {
  confirm: { label: string; change: Change } | null
  reject: { label: string; change: Change }
}) {
  const { change, reload } = useStudioData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef(actionKey())
  // State disables the buttons on the next render; a second press in the
  // same moment must not send a second decision.
  const sending = useRef(false)
  const send = async (c: Change) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await change(c, key.current)
    } catch (e) {
      if (e instanceof WriteError && e.kind === "decided") {
        // Someone else decided it since this list was read: read it again,
        // so it is gone here too, and say why.
        toast(e.message)
        reload()
        return
      }
      setError(e instanceof Error ? e.message : String(e))
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <>
      {confirm && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void send(confirm.change)}
        >
          {confirm.label}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void send(reject.change)}
      >
        {reject.label}
      </Button>
      {error && (
        <p role="alert" className="basis-full type-ui-xs text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
