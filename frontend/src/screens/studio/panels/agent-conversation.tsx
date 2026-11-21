import { useEffect, useRef, useState } from "react"

import { Attachment } from "@/components/attachment"
import { Bubble } from "@/components/bubble"
import { Marker } from "@/components/marker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { ProposeOutcomes, type ProposeOutcome } from "./agent-finding"
import {
  AgentStatementView,
  ProposeFinding,
  ProposePipeline,
} from "./agent-statement"
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
  const showPipelines = useStudio((s) => s.showPipelines)
  const requestFit = useStudio((s) => s.requestFit)
  return (ref) => {
    const featureId = ref.type === "feature" ? ref.id : ref.feature_id
    if (!featureId) return
    const pipeline = network.pipelines.find((p) => p.id === featureId)
    if (pipeline) {
      const members = network.sections.filter(
        (s) => s.pipelineId === pipeline.id
      )
      showPipelines()
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

/** From this many turns the header suggests starting fresh. */
const LONG_CHAT_TURNS = 12

/** What came of each Propose, by finding handle, from the turns that asked. */
function outcomesOf(
  turns: readonly AgentTurn[],
  working: boolean
): Map<string, ProposeOutcome> {
  const outcomes = new Map<string, ProposeOutcome>()
  turns.forEach((turn, i) => {
    const handle = turn.question.action?.finding
    if (!handle) return
    const first = turn.answer?.statements[0]
    if (first?.kind === "proposed")
      outcomes.set(handle, { state: "proposed", text: first.text })
    else if (first) outcomes.set(handle, { state: "refused", text: first.text })
    else if (working && i === turns.length - 1)
      outcomes.set(handle, { state: "pending" })
  })
  return outcomes
}

/** A search was started and nothing came back from it: it was stopped. */
function searchLeftUnfinished(statements: readonly AgentStatement[]): boolean {
  const started = statements.findIndex(
    (s) => s.kind === "citation_request" && s.request
  )
  return (
    started >= 0 &&
    !statements
      .slice(started + 1)
      .some((s) => ["finding", "searched", "worked_out"].includes(s.kind))
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
  // A search goes on after its first lines are shown: its steps stay live.
  const searchingNow = last && working && turn.answer !== null
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
          <AgentSteps
            steps={searchingNow ? liveSteps : turn.steps}
            working={searchingNow}
          />
          <AnswerBody
            turn={{ ...turn, answer: turn.answer }}
            name={name}
            open={open}
          />
          <AgentSources statements={turn.answer.statements} open={open} />
          {!searchingNow && searchLeftUnfinished(turn.answer.statements) && (
            <Marker>
              Stopped before the search finished. Nothing was written.
            </Marker>
          )}
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
  const { network, reload } = useStudioData()
  const [confirmClear, setConfirmClear] = useState(false)
  // A hint, not a warning: the Agent reads no earlier turn, so a long chat does
  // not make answers worse; it buries the current turn and loads slower.
  const long = agent.turns.length >= LONG_CHAT_TURNS
  // Clears the messages for everyone and keeps what cite found (code, no model).
  const startFresh = () =>
    void agent
      .ask({
        words: "Start fresh",
        about: [],
        network: network.name,
        action: { kind: "fresh_start" },
      })
      .then(onCleared)
  const logRef = useRef<HTMLDivElement>(null)
  const last = agent.turns.at(-1)
  // After a finding is proposed, store holds a new candidate claim: read again.
  const reloaded = useRef<string | null>(null)
  useEffect(() => {
    if (!last?.answer || reloaded.current === last.id) return
    if (last.answer.statements.some((s) => s.kind === "proposed")) {
      reloaded.current = last.id
      reload()
    }
  }, [last, reload])
  const propose = agent.working
    ? null
    : (handle: string) =>
        void agent.ask({
          words: `Propose ${handle}`,
          about: [],
          network: network.name,
          action: { kind: "propose", finding: handle },
        })
  const proposePipeline = agent.working
    ? null
    : (sectionIds: string[]) =>
        void agent.ask({
          words: `Propose these ${sectionIds.length} sections as one pipeline`,
          about: [],
          network: network.name,
          action: { kind: "propose_pipeline", section_ids: sectionIds },
        })
  // Keep the newest turn in view as it is asked and answered.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [agent.turns.length, last?.answer, agent.working, agent.liveSteps.length])
  return (
    <>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="type-ui-xs text-muted-foreground">
          {agent.searching
            ? "The Agent is searching the journals"
            : agent.working
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
            onClick={startFresh}
            disabled={agent.working || agent.turns.length === 0}
            title="Clear the messages and keep what cite found"
          >
            Start fresh
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setConfirmClear(true)}
            disabled={agent.turns.length === 0 && !agent.working}
          >
            Clear chat
          </Button>
        </span>
      </div>
      {long && (
        <p className="px-3 pt-1 type-ui-xs text-muted-foreground" role="note">
          Long chat: {plural(agent.turns.length, "turn")}
          {agent.carried > 0
            ? `, ${plural(agent.carried, "finding")} kept`
            : ""}
          . Start fresh clears the messages
          {agent.carried > 0 ? " and keeps the findings" : ""}.
        </p>
      )}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the chat for everyone?</DialogTitle>
            <DialogDescription>
              The conversation is shared by everyone using this Studio. Clearing
              deletes every message and what cite found
              {agent.carried > 0
                ? ` (${plural(agent.carried, "finding")})`
                : ""}
              . Nothing in store changes. To keep the findings, use Start fresh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmClear(false)
                void agent.clear().then(onCleared)
              }}
            >
              Clear chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div
        ref={logRef}
        role="log"
        aria-label="Conversation with the Agent"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4"
      >
        <ProposePipeline value={proposePipeline}>
          <ProposeFinding value={propose}>
            <ProposeOutcomes value={outcomesOf(agent.turns, agent.working)}>
              {agent.turns.map((turn, i) => (
                <Turn
                  key={turn.id}
                  turn={turn}
                  working={agent.working}
                  last={i === agent.turns.length - 1}
                  liveSteps={agent.liveSteps}
                />
              ))}
            </ProposeOutcomes>
          </ProposeFinding>
        </ProposePipeline>
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
