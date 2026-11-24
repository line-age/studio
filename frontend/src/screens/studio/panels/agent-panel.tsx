import { useEffect, useRef, useState } from "react"

import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Composer } from "@/components/composer"
import { Icon } from "@/components/icons/icon"
import { Marker } from "@/components/marker"
import { Note } from "@/components/note"
import { PanelHeader } from "@/components/panel-header"
import { examplesFor } from "@/data/agent/composer-examples"

import { EmptyChat } from "./empty-chat"
import { ProposalLink } from "@/components/proposal-link"
import { Button } from "@/components/ui/button"
import {
  geometryBounds,
  plural,
  sectionLabel,
  unionBounds,
} from "@/data/derive"
import { buildQuestion, refKey, refWords, type AgentRef } from "@/data/question"
import type { ThreadItem } from "@/data/schema"

import { ensureDetails, useDetailLookup } from "@/data/detail-store"
import { dataSource } from "@/data/load-network"

import { useSelectionAttachments } from "../add-to-agent"
import { HidePanels } from "../panel-toggle"
import { AgentConversation, type Agent } from "./agent-conversation"
import { AgentInbox } from "./agent-inbox"
import { INBOX_SHOWN } from "./inbox-shown"
import { AttachPicker } from "./attach-picker"
import { SendWhenFree } from "./send-when-free"
import { useRevealSection, useStudioData } from "../studio-data"
import { useStudio, type SentQuestion } from "../studio-store"

/** A message sent while the Agent answers, with what was attached to it. */
interface Waiting {
  words: string
  attachments: ReturnType<typeof useStudio.getState>["agentAttachments"]
  refs: AgentRef[]
}

/*
 * The Agent panel: the conversation the fixture holds, then the questions
 * asked in this visit. A question is built as the answering service will
 * receive it (src/data/question.ts), but nothing is sent anywhere: there is
 * no Agent behind it yet, and the thread says so after each question.
 */

const ICON: Record<AgentRef["kind"], "line" | "source" | "ask"> = {
  claim: "line",
  citation: "source",
  proposal: "ask",
}

/** Opens the thing a reference names: its section and claim, or its pipeline. */
function useOpenRef(): (ref: AgentRef) => void {
  const { network } = useStudioData()
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const showPipelines = useStudio((s) => s.showPipelines)
  const reveal = useRevealSection()
  const requestFit = useStudio((s) => s.requestFit)
  return (ref) => {
    if (ref.kind === "claim" && ref.owner === "pipeline") {
      const members = network.sections.filter(
        (s) => s.pipelineId === ref.ownerId
      )
      showPipelines()
      selectPipeline(
        ref.ownerId,
        members.map((s) => s.id)
      )
      requestFit(unionBounds(members.map((s) => geometryBounds(s.geometry))))
      return
    }
    const sectionId = ref.kind === "claim" ? ref.ownerId : ref.sectionId
    const section = network.sections.find((s) => s.id === sectionId)
    if (!section) return
    reveal(section.id)
    selectAttribute(section.id, ref.attribute)
    requestFit(geometryBounds(section.geometry))
  }
}

/** A reference in an answer: what it rests on. A click opens it. */
function Reference({ value }: { value: AgentRef }) {
  const { network } = useStudioData()
  const open = useOpenRef()
  const details = useDetailLookup()
  const { title, meta } = refWords(value, network, details)
  return (
    <button
      type="button"
      aria-label={`Open ${title}, ${meta}`}
      onClick={() => open(value)}
      className="self-start rounded-xl text-left transition-colors duration-100 outline-none focus-visible:shadow-focus-ring hover:[&>div]:bg-muted"
    >
      <Attachment icon={ICON[value.kind]} title={title} meta={meta} />
    </button>
  )
}

/** A question asked in this visit, then the plain fact that nobody answers. */
function Sent({ sent }: { sent: SentQuestion }) {
  const { network } = useStudioData()
  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        <AttachmentChips items={sent.attachments} refs={sent.refs} />
        <Bubble className="max-w-75">{sent.question.words}</Bubble>
      </div>
      <Marker>
        The Agent cannot answer yet. The question stays here; it was not sent
        anywhere.
      </Marker>
      <span className="sr-only">
        {`Asked about ${plural(sent.question.about.length, "thing")} in ${network.name}.`}
      </span>
    </>
  )
}

function ThreadEntry({ item }: { item: ThreadItem }) {
  const { network, sectionById } = useStudioData()
  const selectAttribute = useStudio((s) => s.selectAttribute)

  if (item.kind === "marker") {
    return <Marker separator={item.separator}>{item.text}</Marker>
  }

  if (item.kind === "user") {
    const section = item.attachment
      ? sectionById.get(item.attachment.sectionId)
      : undefined
    return (
      <div className="flex flex-col items-end gap-1.5">
        {section && (
          <Attachment
            title={sectionLabel(section)}
            meta={[
              section.name === null ? null : section.code,
              item.attachment?.attribute,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        <Bubble className="max-w-75">{item.text}</Bubble>
      </div>
    )
  }

  // An answer from store: each statement, then what it rests on.
  if (item.statements.length > 0) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="type-ui-sm">{item.text}</p>
        {item.statements.map((statement, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <p className="type-ui-sm">{statement.text}</p>
            {statement.refs.map((ref) => (
              <Reference key={refKey(ref)} value={ref} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const notes = network.notes.filter((n) => item.noteIds.includes(n.id))
  const target = item.proposal
    ? sectionById.get(item.proposal.sectionId)
    : undefined
  const proposals =
    target?.values.find((c) => c.attribute === item.proposal?.attribute)
      ?.proposals ?? 0

  return (
    <div className="flex flex-col gap-2.5">
      <p className="type-ui-sm">{item.text}</p>
      {notes.map((note) => (
        <Note
          key={note.id}
          number={note.number}
          quote={[note.quote, note.source].filter(Boolean).join("  ")}
        >
          {note.text}
        </Note>
      ))}
      {target && item.proposal && proposals > 0 && (
        <ProposalLink
          onClick={() => selectAttribute(target.id, item.proposal!.attribute)}
        >
          {plural(proposals, "proposal")} in the property panel
        </ProposalLink>
      )}
      <div className="flex gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy the answer"
          className="text-muted-foreground"
        >
          <Icon name="copy" className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Ask again"
          className="text-muted-foreground"
        >
          <Icon name="redo" className="size-3" />
        </Button>
      </div>
    </div>
  )
}

/** What is attached to the question being written; each can come off. */
function PendingAttachments() {
  const items = useStudio((s) => s.agentAttachments)
  const refs = useStudio((s) => s.agentRefs)
  const detach = useStudio((s) => s.detachFromAgent)
  const detachRef = useStudio((s) => s.detachRef)
  if (items.length === 0 && refs.length === 0) return null
  return (
    <AttachmentChips
      items={items}
      refs={refs}
      onRemove={detach}
      onRemoveRef={detachRef}
    />
  )
}

/** Chips for attached sections and finer things, removable while written. */
function AttachmentChips({
  items,
  refs,
  onRemove,
  onRemoveRef,
}: {
  items: SentQuestion["attachments"]
  refs: readonly AgentRef[]
  onRemove?: (pipelineId: string) => void
  onRemoveRef?: (key: string) => void
}) {
  const { network, summaryById, sectionById, everySection } = useStudioData()
  const details = useDetailLookup()
  const groupById = new Map(everySection.map((g) => [g.id, g]))
  const chips = items.map((item) => {
    const summary =
      summaryById.get(item.pipelineId) ?? groupById.get(item.pipelineId)
    const remove = onRemove ? () => onRemove(item.pipelineId) : undefined
    // A group of another grouping (attached, then the list was regrouped):
    // its sections are still what was attached.
    if (!summary) {
      if (item.sectionIds === "all") return null
      const one =
        item.sectionIds.length === 1
          ? sectionById.get(item.sectionIds[0])
          : undefined
      return (
        <Attachment
          key={item.pipelineId}
          icon={one ? undefined : "line"}
          title={
            one ? sectionLabel(one) : plural(item.sectionIds.length, "section")
          }
          meta={one && one.name !== null ? one.code : ""}
          onRemove={remove}
        />
      )
    }
    const total = summary.sections.length
    const count = item.sectionIds === "all" ? total : item.sectionIds.length
    // One section reads best by its own name.
    const only =
      item.sectionIds !== "all" && count === 1
        ? sectionById.get(item.sectionIds[0])
        : undefined
    if (only) {
      return (
        <Attachment
          key={item.pipelineId}
          title={sectionLabel(only)}
          meta={[
            only.name === null ? null : only.code,
            summary.unassigned ? null : summary.name,
          ]
            .filter(Boolean)
            .join(" · ")}
          onRemove={remove}
        />
      )
    }
    return (
      <Attachment
        key={item.pipelineId}
        icon="line"
        title={summary.name}
        meta={
          summary.unassigned
            ? plural(count, "section")
            : count === total
              ? "Whole pipeline"
              : `${count} of ${plural(total, "section")}`
        }
        onRemove={remove}
      />
    )
  })
  return (
    <>
      {chips}
      {refs.map((ref) => {
        const key = refKey(ref)
        const { title, meta } = refWords(ref, network, details)
        return (
          <Attachment
            key={key}
            icon={ICON[ref.kind]}
            title={title}
            meta={meta}
            onRemove={onRemoveRef ? () => onRemoveRef(key) : undefined}
          />
        )
      })}
    </>
  )
}

export function AgentPanel() {
  const { network } = useStudioData()
  const asked = useStudio((s) => s.agentAsked)
  const draft = useStudio((s) => s.agentDraft)
  const sent = useStudio((s) => s.sentQuestions)
  const send = useStudio((s) => s.sendQuestion)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  // While the Agent is open, what is selected is what the next question is
  // about (the owner, 2026-11-22): it is attached as it is selected, and again
  // after a question is sent, so a follow-up is about the same thing. Nothing
  // selected leaves the attachments as they are (the picker still adds). A
  // claim or a source handed over is more exact than the selection: then the
  // selection is not added to it.
  const selection = useStudio((s) => s.selection)
  const selected = useSelectionAttachments()
  const attachSelection = useStudio((s) => s.attachSelection)
  const exact = useStudio((s) => s.agentRefs.length > 0)
  const mirrored = useRef<ReadonlySet<string> | null>(null)
  useEffect(() => {
    if (selection.size === 0 || exact) return
    // Only a change of selection attaches. Once sent, or taken off by the
    // person, the same selection is not put back: a follow-up is about the
    // last question's things anyway, and a removed attachment stays removed.
    if (mirrored.current === selection) return
    mirrored.current = selection
    attachSelection(selected)
    // `selected` is derived from `selection`; listing it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, exact, attachSelection])
  // On store's data the Agent service answers; on the sample nothing does.
  const fromStore = dataSource() === "store"

  // A message the Agent could not take stays in the box; this says why, for
  // as long as the reason holds.
  const [held, setHeld] = useState<"working" | "down" | null>(null)
  // A message sent while the Agent answers waits here, with what was attached,
  // and goes as soon as the Agent is free (plan 2026-11-24-001, B). One at a time.
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  const sendNow = (agent: Agent, { words, attachments, refs }: Waiting) => {
    // A claim, a source or a proposal goes by its id: the sections they are on
    // are read first, if they are not yet.
    const sectionIds = [
      ...new Set(
        refs.flatMap((ref) =>
          ref.kind === "claim"
            ? ref.owner === "section"
              ? [ref.ownerId]
              : []
            : [ref.sectionId]
        )
      ),
    ]
    void ensureDetails(sectionIds).then((details) => {
      const question = buildQuestion({
        words,
        sections: attachments,
        refs,
        network,
        details,
      })
      // If it never gets an answer, the words and what was attached come back
      // to the box.
      void agent.ask(question, () => {
        // Never over words the person has typed since.
        if (messageRef.current?.value.trim()) return
        useStudio.getState().askAgent(attachments, { refs, words })
      })
    })
  }
  // The attach picker is open above the message.
  const [picking, setPicking] = useState(false)

  const attachments = useStudio((s) => s.agentAttachments)
  const composer = (agent: Agent | null) => (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
      {waiting && agent?.working && (
        <Marker>
          The Agent is still answering. Your message is sent when it finishes.
        </Marker>
      )}
      {held === "working" && agent?.working && (
        <Marker>The Agent is still answering. Your message waits here.</Marker>
      )}
      {agent && waiting && (
        <SendWhenFree
          working={agent.working}
          onFree={() => {
            setWaiting(null)
            sendNow(agent, waiting)
          }}
        />
      )}
      {held === "down" && fromStore && !agent && (
        <Marker>The Agent is not running. Your message waits here.</Marker>
      )}
      <Composer
        placeholder="Ask about anything on screen. Type # to add it."
        // An empty chat writes examples in the box (Figma board E); off once
        // the chat has a question in it.
        examples={
          (agent ? agent.turns.length === 0 : sent.length === 0)
            ? examplesFor(attachments)
            : []
        }
        attachments={<PendingAttachments />}
        onAttach={() => setPicking(true)}
        picker={
          picking && (
            <AttachPicker
              onClose={() => {
                setPicking(false)
                messageRef.current?.focus()
              }}
            />
          )
        }
        inputRef={messageRef}
        onStop={agent?.working ? () => void agent.stop() : undefined}
        draft={draft === null ? undefined : { text: draft, nonce: asked }}
        onSend={(words) => {
          const s = useStudio.getState()
          const attachments = s.agentAttachments
          const refs = s.agentRefs
          if (agent) {
            if (agent.working) {
              // One message waits at a time; a second stays in the box.
              if (waiting) {
                setHeld("working")
                return false
              }
              setWaiting({ words, attachments, refs })
              s.clearAgentDraft()
              return
            }
            setHeld(null)
            sendNow(agent, { words, attachments, refs })
            s.clearAgentDraft()
            return
          }
          const question = buildQuestion({
            words,
            sections: attachments,
            refs,
            network,
          })
          // On store's data only the service answers: while it is down or
          // starting nothing would show the question, so it is not taken.
          if (fromStore) {
            setHeld("down")
            return false
          }
          send({ question, attachments, refs })
        }}
      />
    </div>
  )

  // "Ask the Agent" hands over references and expects to type next.
  useEffect(() => {
    // Once per hand-over, even when the panel opens for it or opens again.
    const s = useStudio.getState()
    if (asked === s.agentAskFocused) return
    s.agentAskTaken()
    messageRef.current?.focus()
  }, [asked])

  return (
    <>
      <PanelHeader
        title="Agent"
        meta="Changes nothing until you approve"
        divider
      >
        <HidePanels />
      </PanelHeader>
      {INBOX_SHOWN && <AgentInbox />}
      {fromStore ? (
        <AgentConversation
          composer={(agent) => composer(agent)}
          // A message waiting to be sent goes back to the box, not into a
          // chat being cleared.
          onClear={() => {
            if (!waiting) return
            const { attachments, refs, words } = waiting
            setWaiting(null)
            useStudio.getState().askAgent(attachments, { refs, words })
          }}
        />
      ) : (
        <>
          <div
            role="log"
            aria-label="Conversation with the Agent"
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4"
          >
            {network.agentThread.map((item, i) => (
              <ThreadEntry key={i} item={item} />
            ))}
            {sent.map((question, i) => (
              <Sent key={i} sent={question} />
            ))}
            {network.agentThread.length === 0 && sent.length === 0 && (
              <EmptyChat />
            )}
          </div>
          {composer(null)}
        </>
      )}
    </>
  )
}
