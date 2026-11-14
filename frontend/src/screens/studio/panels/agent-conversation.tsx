import { useEffect, useRef, useState } from "react"

import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Marker } from "@/components/marker"
import { Button } from "@/components/ui/button"
import { geometryBounds, plural, sectionLabel } from "@/data/derive"
import { shortId } from "@/data/short-id"
import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import {
  ATTRIBUTE_LABEL,
  type AgentAnswerRef,
  type AgentStatement,
  type AgentStep,
} from "@/data/agent/answer"
import {
  useAgent,
  useSharedThread,
  type AgentTurn,
} from "@/data/agent/use-agent"
import type { Question } from "@/data/question"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { AgentSources } from "./agent-sources"
import { AgentStatementView } from "./agent-statement"
import { AgentSteps } from "./agent-steps"

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

/** The attached section a statement is about, if one: grouping several. */
function sectionOf(
  statement: AgentStatement,
  attached: ReadonlySet<string>
): string | null {
  for (const ref of statement.refs) {
    const id = ref.type === "feature" ? ref.id : ref.feature_id
    if (id && attached.has(id)) return id
  }
  return null
}

/**
 * The statements of an answer. About several sections, they are grouped under
 * each section's name, in the order the answer gives them; attached sections
 * it did not go into are listed after, each opens on its own.
 */
function AnswerBody({
  turn,
  name,
  open,
}: {
  turn: AgentTurn & { answer: NonNullable<AgentTurn["answer"]> }
  name: (id: string) => string | null
  open: (ref: AgentAnswerRef) => void
}) {
  const attached = turn.question.about
    .filter((i) => i.kind === "section" && i.id)
    .map((i) => i.id as string)
  const statements = turn.answer.statements
  // A fixed line (a question back, a refusal, a failure) is the whole answer.
  const fixed = statements.some((s) =>
    ["clarify", "refusal", "failure", "greeting"].includes(s.kind)
  )
  if (attached.length < 2 || fixed)
    return (
      <>
        {statements.map((statement, i) => (
          <AgentStatementView
            key={i}
            statement={statement}
            name={name}
            open={open}
          />
        ))}
      </>
    )
  const set = new Set(attached)
  const groups: { id: string | null; items: AgentStatement[] }[] = []
  for (const statement of statements) {
    const id = sectionOf(statement, set) ?? groups.at(-1)?.id ?? null
    const group = groups.find((g) => g.id === id)
    if (group) group.items.push(statement)
    else groups.push({ id, items: [statement] })
  }
  const rest = attached.filter((id) => !groups.some((g) => g.id === id))
  const openSection = (id: string) => open({ type: "feature", id })
  return (
    <>
      {groups.map((group) => (
        <section
          key={group.id ?? "none"}
          aria-label={group.id ? (name(group.id) ?? undefined) : undefined}
          className="flex flex-col gap-2.5 border-t border-border-subtle pt-3"
        >
          {group.id && (
            <button
              type="button"
              onClick={() => openSection(group.id as string)}
              className="flex items-center gap-1 self-start rounded-sm type-ui-sm-medium text-primary outline-none hover:underline focus-visible:shadow-focus-ring"
            >
              <Icon name="line" className="size-3.5" />
              {name(group.id) ?? shortId(group.id)}
            </button>
          )}
          {group.items.map((statement, i) => (
            <AgentStatementView
              key={i}
              statement={statement}
              name={name}
              open={open}
            />
          ))}
        </section>
      ))}
      {rest.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-border-subtle pt-3">
          <p className="type-ui-sm">
            {rest.length === 1
              ? "1 more section is not in this answer."
              : `${rest.length} more sections are not in this answer.`}{" "}
            Open one, or ask about it.
          </p>
          <div className="flex flex-wrap gap-1">
            {rest.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => openSection(id)}
                className="rounded-full outline-none focus-visible:shadow-focus-ring"
              >
                <Badge variant="outline">{name(id) ?? shortId(id)}</Badge>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
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
  liveSteps,
}: {
  turn: AgentTurn
  working: boolean
  last: boolean
  liveSteps: readonly AgentStep[]
}) {
  const { network, sectionById } = useStudioData()
  const open = useOpenAgentRef()
  const name = (id: string) => {
    const section = sectionById.get(id)
    if (section) return sectionLabel(section)
    return network.pipelines.find((p) => p.id === id)?.name ?? null
  }
  const about = asked(turn.question)
  const now = last && working && !turn.answer
  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
        {about && <Attachment icon="line" title={about} meta="Attached" />}
        <Bubble className="max-w-75">{turn.question.words}</Bubble>
      </div>
      {turn.answer ? (
        <div
          className="flex flex-col gap-3"
          role="article"
          aria-label="The Agent's answer"
        >
          <AgentSteps steps={turn.steps} working={false} />
          <AnswerBody
            turn={{ ...turn, answer: turn.answer }}
            name={name}
            open={open}
          />
          <AgentSources statements={turn.answer.statements} open={open} />
        </div>
      ) : now ? (
        <AgentSteps steps={liveSteps} working />
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
  }, [agent.turns.length, last?.answer, agent.working, agent.liveSteps.length])
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
            liveSteps={agent.liveSteps}
          />
        ))}
        {agent.turns.length === 0 && <Marker>No conversation yet.</Marker>}
        {agent.error && (
          <Marker>
            The Agent could not answer. Send the question again to retry.
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
