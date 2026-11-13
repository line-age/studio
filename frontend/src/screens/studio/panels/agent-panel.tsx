import { useEffect, useRef } from "react"

import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Composer } from "@/components/composer"
import { Icon } from "@/components/icons/icon"
import { Marker } from "@/components/marker"
import { Note } from "@/components/note"
import { PanelHeader } from "@/components/panel-header"
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

import { HidePanels } from "../panel-toggle"
import { useStudioData } from "../studio-data"
import { useStudio, type SentQuestion } from "../studio-store"

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
  const { network, edition } = useStudioData()
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const setList = useStudio((s) => s.setList)
  const requestFit = useStudio((s) => s.requestFit)
  return (ref) => {
    if (ref.kind === "claim" && ref.owner === "pipeline") {
      const members = network.sections.filter(
        (s) => s.pipelineId === ref.ownerId && s.editionIds.includes(edition.id)
      )
      setList("pipelines")
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
    selectAttribute(section.id, ref.attribute)
    requestFit(geometryBounds(section.geometry))
  }
}

/** A reference in an answer: what it rests on. A click opens it. */
function Reference({ value }: { value: AgentRef }) {
  const { network } = useStudioData()
  const open = useOpenRef()
  const { title, meta } = refWords(value, network)
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
    target?.claims.find((c) => c.attribute === item.proposal?.attribute)
      ?.proposals.length ?? 0

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
  const groupById = new Map(everySection.map((g) => [g.id, g]))
  const chips = items.map((item) => {
    const summary =
      summaryById.get(item.pipelineId) ?? groupById.get(item.pipelineId)
    if (!summary) return null
    const remove = onRemove ? () => onRemove(item.pipelineId) : undefined
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
        const { title, meta } = refWords(ref, network)
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

/** The last hand-over the message box took the cursor for. */
let askHandled = 0

export function AgentPanel() {
  const { network, edition } = useStudioData()
  const asked = useStudio((s) => s.agentAsked)
  const draft = useStudio((s) => s.agentDraft)
  const sent = useStudio((s) => s.sentQuestions)
  const send = useStudio((s) => s.sendQuestion)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  // "Ask the Agent" hands over references and expects to type next.
  useEffect(() => {
    if (asked === askHandled) return
    askHandled = asked
    messageRef.current?.focus()
  }, [asked])

  return (
    <>
      <PanelHeader title="Agent" divider>
        <HidePanels />
      </PanelHeader>
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
          <Marker>No conversation yet.</Marker>
        )}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer
          placeholder="Ask about a section. Type # to pick one."
          attachments={<PendingAttachments />}
          inputRef={messageRef}
          draft={draft === null ? undefined : { text: draft, nonce: asked }}
          onSend={(words) => {
            const s = useStudio.getState()
            const attachments = s.agentAttachments
            const refs = s.agentRefs
            send({
              question: buildQuestion({
                words,
                sections: attachments,
                refs,
                network,
                edition,
              }),
              attachments,
              refs,
            })
          }}
        />
      </div>
    </>
  )
}
