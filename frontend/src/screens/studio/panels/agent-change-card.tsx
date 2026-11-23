import { use, useLayoutEffect, useRef, useState } from "react"

import {
  DecisionCard,
  DecisionCardActions,
  DecisionCardHead,
  DecisionCardLink,
  DecisionCardOutcome,
  DecisionCardRow,
  DecisionCardRows,
  type DecisionBy,
  type DecisionTone,
} from "@/components/decision-card"
import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import type { ChangeOffer } from "@/data/agent/answer"
import {
  byYou,
  doneWords,
  labelOf,
  staleness,
  writeFor,
} from "@/data/agent/change-offer"
import { pipelineLabel, sectionLabel } from "@/data/derive"
import type { OutcomeState } from "@/data/question"
import { WriteError } from "@/data/store/write"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { AgentCards, CardQuestion } from "./agent-cards"
import { useSaveSectionEdits } from "./section-edits"

/*
 * A change the person asked for in words, as one card (Figma section 28,
 * boards A and B). Approve makes it as the person, through the same writes
 * as the menu and the modals, with the offer's id as the action's key, so a
 * second press or a second tab writes once. Before writing, Studio reads the
 * network again and checks the card is still true; if not, it is out of date
 * and nothing is sent. What came of it goes back to the thread, so the card
 * reads the same for everyone and after a reload.
 */

/** How many sections a row names before it counts the rest. */
const NAMED = 8

/** The card's state: what the thread recorded, or this browser's press. */
type Shown =
  | { state: "waiting" }
  | { state: "saving" }
  | { state: OutcomeState; detail?: string }

const OUTCOME: Record<
  OutcomeState,
  { tone: DecisionTone; title: string; by?: DecisionBy }
> = {
  done: { tone: "done", title: "Done" },
  declined: { tone: "closed", title: "Declined", by: "closed" },
  dismissed: { tone: "closed", title: "Dismissed", by: "closed" },
  failed: { tone: "failed", title: "Couldn't save. Nothing was changed." },
  out_of_date: {
    tone: "out-of-date",
    title: "Out of date. Nothing was changed.",
  },
}

export function AgentChangeCard({
  title,
  offer,
}: {
  /** The Agent's words for the change: "Add 4 sections to Tolland lateral". */
  title: string
  offer: ChangeOffer
}) {
  const { network, sectionById, change, reload } = useStudioData()
  const saveEdits = useSaveSectionEdits()
  const select = useStudio((s) => s.select)
  const edit = useStudio((s) => s.edit)
  const cards = use(AgentCards)
  const question = use(CardQuestion)
  const [local, setLocal] = useState<Shown>({ state: "waiting" })
  // The network as it is after a read, for the check before the write.
  const latest = useRef(network)
  useLayoutEffect(() => {
    latest.current = network
  }, [network])

  // A press made here is newer than the thread's record until it catches up;
  // otherwise the thread says, the same for everyone and after a reload.
  const recorded = cards.outcome(offer.id)
  const shown: Shown = local.state !== "waiting" ? local : (recorded ?? local)
  const detail = "detail" in shown ? shown.detail : undefined
  const isEdit = offer.kind === "edit"
  const by: DecisionBy =
    shown.state in OUTCOME
      ? (OUTCOME[shown.state as OutcomeState].by ?? "you")
      : "you"

  const report = async (state: OutcomeState, detail?: string) => {
    setLocal({ state, ...(detail ? { detail } : {}) })
    await cards.report?.(offer.id, state, detail)
  }

  const approve = async () => {
    setLocal({ state: "saving" })
    // Read again, then check the card is still true (D3).
    await reload()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const why = staleness(offer, latest.current)
    if (why) return report("out_of_date", why)
    try {
      const write = writeFor(offer)
      if (write.kind === "change") await change(write.change, offer.id)
      else await saveEdits(write.sectionIds, write.edits, "", offer.id)
      await new Promise((resolve) => setTimeout(resolve, 0))
      await report(
        "done",
        `${doneWords(offer, latest.current)} ${byYou(new Date())}`
      )
    } catch (error) {
      const reason =
        error instanceof WriteError
          ? error.reason
          : error instanceof Error
            ? error.message
            : ""
      await report("failed", reason)
    }
  }

  const sections = offer.section_ids.map((id) => {
    const section = sectionById.get(id)
    return section ? sectionLabel(section) : id.slice(0, 8)
  })
  const named =
    sections.length > NAMED
      ? `${sections.slice(0, NAMED).join(", ")} +${sections.length - NAMED} more`
      : sections.join(", ")
  const pipeline = network.pipelines.find((p) => p.id === offer.pipeline_id)
  const pipelineWords = pipeline
    ? pipeline.name
      ? `${pipeline.name} · ${pipeline.code}`
      : pipelineLabel(pipeline)
    : null
  const busy = cards.report === null
  const outcome =
    shown.state in OUTCOME ? OUTCOME[shown.state as OutcomeState] : null

  return (
    <DecisionCard by={by} label={title}>
      <DecisionCardHead
        by={by}
        title={title}
        who={
          isEdit
            ? "Your edit. Saved as yours, as the Edit window does."
            : "Your change. Made when you approve."
        }
      />
      <DecisionCardRows>
        {sections.length > 0 && (
          <DecisionCardRow
            label={sections.length === 1 ? "Section" : "Sections"}
            code
          >
            {named}
          </DecisionCardRow>
        )}
        {pipelineWords && (
          <DecisionCardRow label="Pipeline" code>
            {pipelineWords}
          </DecisionCardRow>
        )}
        {offer.kind === "make" && (
          <DecisionCardRow label="Name">
            {offer.name ?? "None yet"}
          </DecisionCardRow>
        )}
        {offer.kind === "rename" && (
          <DecisionCardRow label="Name">{offer.name}</DecisionCardRow>
        )}
        {isEdit && (
          <>
            <DecisionCardRow label={labelOf(offer.attribute)}>
              {offer.value}
            </DecisionCardRow>
            <DecisionCardRow label="Source">Entered by hand</DecisionCardRow>
          </>
        )}
        {offer.note && (
          <DecisionCardRow label="Note">{offer.note}</DecisionCardRow>
        )}
      </DecisionCardRows>
      {outcome && (
        <DecisionCardOutcome tone={outcome.tone} title={outcome.title}>
          {detail ??
            (shown.state === "declined" ? "Nothing was changed." : undefined)}
        </DecisionCardOutcome>
      )}
      {outcome === null && (
        <DecisionCardActions
          aside={
            isEdit && shown.state === "waiting" ? (
              <DecisionCardLink
                onClick={() => {
                  const prefill = {
                    [labelOf(offer.attribute)]: offer.value ?? "",
                  }
                  edit(
                    offer.section_ids.length > 0
                      ? {
                          kind: "edit-sections",
                          sectionIds: offer.section_ids,
                          prefill,
                        }
                      : {
                          kind: "edit-pipeline",
                          pipelineId: offer.pipeline_id!,
                          prefill,
                        }
                  )
                }}
              >
                Open in Edit
              </DecisionCardLink>
            ) : undefined
          }
        >
          {shown.state === "saving" ? (
            <Button size="sm" disabled>
              {isEdit ? "Saving" : "Approving"}
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => void approve()}>
                <Icon name="check" data-icon="inline-start" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void report("declined")}
              >
                Decline
              </Button>
            </>
          )}
        </DecisionCardActions>
      )}
      {shown.state === "done" && offer.section_ids.length > 0 && (
        <DecisionCardActions>
          <Button
            size="sm"
            variant="outline"
            onClick={() => select(offer.section_ids)}
          >
            Show on map
          </Button>
        </DecisionCardActions>
      )}
      {shown.state === "failed" && (
        <DecisionCardActions>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void approve()}
          >
            Try again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void report("declined")}
          >
            Decline
          </Button>
        </DecisionCardActions>
      )}
      {shown.state === "out_of_date" && question && cards.ask && (
        <DecisionCardActions>
          <Button
            size="sm"
            variant="outline"
            onClick={() => cards.ask?.(question)}
          >
            Ask again
          </Button>
        </DecisionCardActions>
      )}
    </DecisionCard>
  )
}
