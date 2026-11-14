import { useEffect, useRef, useState } from "react"

import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Marker } from "@/components/marker"
import { Button } from "@/components/ui/button"
import { geometryBounds, plural, sectionLabel } from "@/data/derive"
import {
  ATTRIBUTE_LABEL,
  STATUS_WORD,
  type AgentAnswerRef,
  type AgentStatement,
} from "@/data/agent/answer"
import {
  useAgent,
  useSharedThread,
  type AgentTurn,
} from "@/data/agent/use-agent"
import type { Question } from "@/data/question"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/*
 * The conversation with the Agent service, on store's data. Every answer shown
 * was checked by the service against what it read from store; each statement
 * lists what it rests on, and a click opens that thing. The Agent never moves
 * the screen itself.
 */

function useOpenAgentRef(): (ref: AgentAnswerRef) => void {
  const { network } = useStudioData()
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const selectSection = useStudio((s) => s.selectSection)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const setList = useStudio((s) => s.setList)
  const requestFit = useStudio((s) => s.requestFit)
  return (ref) => {
    const featureId = ref.type === "feature" ? ref.id : ref.feature_id
    if (!featureId) return
    const pipeline = network.pipelines.find((p) => p.id === featureId)
    if (pipeline) {
      const members = network.sections.filter(
        (s) => s.pipelineId === pipeline.id
      )
      setList("pipelines")
      selectPipeline(
        pipeline.id,
        members.map((s) => s.id)
      )
      return
    }
    const section = network.sections.find((s) => s.id === featureId)
    if (!section) return
    const label = ref.attribute ? ATTRIBUTE_LABEL[ref.attribute] : undefined
    if (label) selectAttribute(section.id, label)
    else selectSection(section.id)
    requestFit(geometryBounds(section.geometry))
  }
}

function refTitle(
  ref: AgentAnswerRef,
  name: (id: string) => string
): { title: string; meta: string } {
  if (ref.type === "feature")
    return { title: name(ref.id), meta: "Read in store" }
  const attribute = ref.attribute
    ? (ATTRIBUTE_LABEL[ref.attribute] ?? ref.attribute)
    : "Claim"
  const status = ref.status ? STATUS_WORD[ref.status] : ""
  const by =
    ref.status === "candidate" && ref.asserter
      ? ` by a ${ref.asserter === "pipeline" ? "tool" : "person"}`
      : ""
  return {
    title: attribute,
    meta: [`${status}${by}`, ref.feature_id ? name(ref.feature_id) : null]
      .filter(Boolean)
      .join(" · "),
  }
}

function Statement({ statement }: { statement: AgentStatement }) {
  const { network, sectionById } = useStudioData()
  const open = useOpenAgentRef()
  const name = (id: string) => {
    const section = sectionById.get(id)
    if (section) return sectionLabel(section)
    const pipeline = network.pipelines.find((p) => p.id === id)
    return pipeline?.name ?? "Pipeline"
  }
  return (
    <div className="flex flex-col gap-1.5" data-kind={statement.kind}>
      <p className="type-ui-sm">{statement.text}</p>
      {statement.refs.map((ref) => {
        const { title, meta } = refTitle(ref, name)
        return (
          <button
            key={`${ref.type}:${ref.id}`}
            type="button"
            aria-label={`Open ${title}, ${meta}`}
            onClick={() => open(ref)}
            className="self-start rounded-xl text-left transition-colors duration-100 outline-none focus-visible:shadow-focus-ring hover:[&>div]:bg-muted"
          >
            <Attachment
              icon={ref.type === "feature" ? "line" : "source"}
              title={title}
              meta={meta}
            />
          </button>
        )
      })}
    </div>
  )
}

function asked(question: Question): string | null {
  const count = question.about.length
  if (count === 0) return null
  const kinds = new Set(question.about.map((i) => i.kind))
  return kinds.size === 1
    ? plural(count, [...kinds][0])
    : plural(count, "thing")
}

function Turn({
  turn,
  working,
  last,
}: {
  turn: AgentTurn
  working: boolean
  last: boolean
}) {
  const about = asked(turn.question)
  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        {about && <Attachment icon="line" title={about} meta="Attached" />}
        <Bubble className="max-w-75">{turn.question.words}</Bubble>
      </div>
      {turn.answer ? (
        <div
          className="flex flex-col gap-2.5"
          role="article"
          aria-label="The Agent's answer"
        >
          {turn.answer.statements.map((statement, i) => (
            <Statement key={i} statement={statement} />
          ))}
        </div>
      ) : last && working ? (
        <Marker>Reading store…</Marker>
      ) : (
        <Marker>Not answered.</Marker>
      )}
    </>
  )
}

export type Agent = ReturnType<typeof useAgent>

/** The live conversation, then the composer. Remounted after "Clear chat". */
function Conversation({
  onCleared,
  composer,
}: {
  onCleared: () => void
  composer: (agent: Agent) => React.ReactNode
}) {
  const agent = useAgent()
  const logRef = useRef<HTMLDivElement>(null)
  const last = agent.turns.at(-1)
  // Keep the newest turn in view as it is asked and answered.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [agent.turns.length, last?.answer, agent.working])
  return (
    <>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="type-ui-xs text-muted-foreground">
          {agent.working
            ? "The Agent is reading store"
            : "One conversation, kept by the Agent"}
        </span>
        <span className="flex gap-1">
          {agent.working && (
            <Button size="xs" variant="ghost" onClick={() => void agent.stop()}>
              Stop
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void agent.clear().then(onCleared)}
            disabled={agent.turns.length === 0 && !agent.working}
          >
            Clear chat
          </Button>
        </span>
      </div>
      <div
        ref={logRef}
        role="log"
        aria-label="Conversation with the Agent"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4"
      >
        {agent.turns.map((turn, i) => (
          <Turn
            key={turn.id}
            turn={turn}
            working={agent.working}
            last={i === agent.turns.length - 1}
          />
        ))}
        {agent.turns.length === 0 && <Marker>No conversation yet.</Marker>}
        {agent.error && (
          <Marker>
            The Agent could not answer. Your question is back in the box.
          </Marker>
        )}
      </div>
      {composer(agent)}
    </>
  )
}

export function AgentConversation({
  composer,
}: {
  composer: (agent: Agent | null) => React.ReactNode
}) {
  const [epoch, setEpoch] = useState(0)
  const thread = useSharedThread(epoch)
  if (thread !== "ready") {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
          <Marker>
            {thread === "starting"
              ? "Opening the conversation…"
              : "The Agent service is not running. Start it with uv run python serve.py in studio/agent."}
          </Marker>
        </div>
        {composer(null)}
      </>
    )
  }
  return (
    <Conversation
      key={epoch}
      onCleared={() => setEpoch((e) => e + 1)}
      composer={composer}
    />
  )
}
