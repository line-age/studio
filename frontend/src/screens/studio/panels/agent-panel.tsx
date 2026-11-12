import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Composer } from "@/components/composer"
import { Icon } from "@/components/icons/icon"
import { Marker } from "@/components/marker"
import { Note } from "@/components/note"
import { PanelHeader } from "@/components/panel-header"
import { ProposalLink } from "@/components/proposal-link"
import { Button } from "@/components/ui/button"
import { plural } from "@/data/derive"
import type { ThreadItem } from "@/data/schema"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/*
 * The Agent panel shows the one conversation the fixture holds. Nothing is
 * sent anywhere: there is no Agent behind it yet.
 */

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
            title={section.name}
            meta={[section.code, item.attachment?.attribute]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        <Bubble className="max-w-75">{item.text}</Bubble>
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
          onClick={() =>
            selectAttribute(
              target.pipelineId ?? "unassigned",
              target.id,
              item.proposal!.attribute
            )
          }
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

/** The pipelines and sections added to the question being written. */
function PendingAttachments() {
  const { summaryById, sectionById } = useStudioData()
  const items = useStudio((s) => s.agentAttachments)
  const detach = useStudio((s) => s.detachFromAgent)
  if (items.length === 0) return null
  return items.map((item) => {
    const key = `${item.kind}-${item.id}`
    if (item.kind === "pipeline") {
      const summary = summaryById.get(item.id)
      if (!summary) return null
      const sections = plural(summary.sections.length, "section")
      return (
        <Attachment
          key={key}
          icon="line"
          title={summary.name}
          meta={summary.code ? `${summary.code} · ${sections}` : sections}
          onRemove={() => detach(item)}
        />
      )
    }
    const section = sectionById.get(item.id)
    if (!section) return null
    return (
      <Attachment
        key={key}
        title={section.name}
        meta={section.code}
        onRemove={() => detach(item)}
      />
    )
  })
}

export function AgentPanel() {
  const { network } = useStudioData()
  return (
    <>
      <PanelHeader
        title="Agent"
        meta={plural(network.notes.length, "note")}
        divider
      />
      <div
        role="log"
        aria-label="Conversation with the Agent"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4"
      >
        {network.agentThread.map((item, i) => (
          <ThreadEntry key={i} item={item} />
        ))}
        {network.agentThread.length === 0 && (
          <Marker>No conversation yet.</Marker>
        )}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer
          placeholder="Ask about a section. Type # to pick one."
          attachments={<PendingAttachments />}
        />
      </div>
    </>
  )
}
