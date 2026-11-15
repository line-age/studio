import { createContext, use, type ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

import { AgentFindingCard } from "./agent-finding"

/** Proposes a finding by its handle; null while nothing may be sent. */
export const ProposeFinding = createContext<((handle: string) => void) | null>(
  null
)

/*
 * One statement of an answer (Figma section 13). Each kind of thing has its
 * own look, so none is taken for another:
 *  - the kind, when it is not a claim: a grey prefix ("Inferred", "Lead,
 *    not in store"), with what it means on hover where the word is not enough;
 *  - a section the sentence names: a link in the text, which opens it;
 *  - what it rests on: a neutral pill with the source icon, the source and
 *    page; a click opens the claim. Its state is in the sentence's words.
 */

export const KIND_PREFIX: Partial<Record<AgentStatement["kind"], string>> = {
  worked_out: "Inferred",
  lead: "Lead, not in store",
}

/** What a prefix means, shown on hover or focus. */
export const KIND_MEANS: Partial<Record<AgentStatement["kind"], string>> = {
  worked_out:
    "Concluded from what store holds, such as which maps show the line. No source states this, so it is not a claim.",
}

/** The things a sentence names that can be opened, by the words it uses. */
function namesIn(
  refs: readonly AgentAnswerRef[],
  name: (id: string) => string | null
): Map<string, AgentAnswerRef> {
  const names = new Map<string, AgentAnswerRef>()
  for (const ref of refs) {
    if (ref.type === "feature") {
      for (const n of [ref.label, name(ref.id)]) if (n) names.set(n, ref)
    } else if (ref.type === "claim" && ref.feature_id) {
      const holder: AgentAnswerRef = {
        type: "feature",
        id: ref.feature_id,
        label: ref.label,
      }
      for (const n of [ref.label, name(ref.feature_id)])
        if (n && !names.has(n)) names.set(n, holder)
    }
  }
  return names
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** The sentence with every name it holds turned into a link. */
function withLinks(
  text: string,
  names: Map<string, AgentAnswerRef>,
  open: (ref: AgentAnswerRef) => void
): { nodes: ReactNode[]; linked: Set<string> } {
  const linked = new Set<string>()
  const keys = [...names.keys()].sort((a, b) => b.length - a.length)
  if (keys.length === 0) return { nodes: [text], linked }
  const pattern = new RegExp(`(${keys.map(escape).join("|")})`, "g")
  const nodes = text.split(pattern).map((part, i) => {
    const ref = names.get(part)
    if (!ref) return part
    linked.add(ref.id)
    return (
      <button
        key={i}
        type="button"
        onClick={() => open(ref)}
        className="rounded-sm text-primary underline underline-offset-2 outline-none hover:text-primary-hover focus-visible:shadow-focus-ring"
      >
        {part}
      </button>
    )
  })
  return { nodes, linked }
}

const STATE_WORDS: Record<string, string> = {
  accepted: "Accepted claim",
  candidate: "Proposed, not decided",
  rejected: "Rejected claim",
}

/**
 * A source a statement rests on, as AI Elements' Inline Citation: the pill
 * opens the claim it was cited for; hovering it shows the source, the passage it
 * quotes and a link to the source, without leaving the chat.
 */
function SourceCitation({
  source,
  claim,
  open,
}: {
  source: string
  claim: AgentAnswerRef
  open: (ref: AgentAnswerRef) => void
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={`Open the claim, from ${source}`}
            onClick={() => open(claim)}
            className="max-w-full min-w-0 rounded-full outline-none focus-visible:shadow-focus-ring"
          />
        }
      >
        {/* A long source shortens; the hover card has it whole. */}
        <Badge
          variant="secondary"
          className="max-w-full hover:bg-secondary-hover"
        >
          <Icon name="source" data-icon="inline-start" />
          <span className="truncate">{source}</span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="flex w-72 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="type-ui-sm-medium">{source}</span>
          {claim.status && (
            <span className="type-ui-xs text-muted-foreground">
              {STATE_WORDS[claim.status] ?? claim.status}
              {claim.label ? ` · ${claim.label}` : ""}
            </span>
          )}
        </div>
        {claim.quote && (
          <blockquote className="border-l-2 border-border pl-2 type-ui-xs">
            {claim.quote}
          </blockquote>
        )}
        {claim.url && (
          <a
            href={claim.url}
            target="_blank"
            rel="noreferrer"
            className="type-ui-xs text-primary underline-offset-2 hover:underline"
          >
            Open the source
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

function KindPrefix({
  kind,
  prefix,
}: {
  kind: AgentStatement["kind"]
  prefix: string
}) {
  const means = KIND_MEANS[kind]
  const grey = "type-ui-sm-medium text-muted-foreground"
  if (!means) return <span className={grey}>{prefix} · </span>
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className={`${grey} rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:shadow-focus-ring`}
            />
          }
        >
          {prefix}
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{means}</TooltipContent>
      </Tooltip>
      <span className={grey}> · </span>
    </>
  )
}

export function AgentStatementView({
  statement,
  name,
  open,
}: {
  statement: AgentStatement
  name: (id: string) => string | null
  open: (ref: AgentAnswerRef) => void
}) {
  const propose = use(ProposeFinding)
  const prefix = KIND_PREFIX[statement.kind]
  const { nodes, linked } = withLinks(
    statement.text,
    namesIn(statement.refs, name),
    open
  )
  // One pill per source; a claim with none says so.
  const sources = new Map<string, AgentAnswerRef>()
  for (const ref of statement.refs) {
    if (ref.type !== "claim") continue
    const key = ref.source ?? "Store holds no source"
    if (!sources.has(key)) sources.set(key, ref)
  }
  // A section or link the sentence does not name still opens from below it.
  const others = statement.refs.filter(
    (ref) =>
      (ref.type === "feature" && !linked.has(ref.id)) || ref.type === "link"
  )
  return (
    <div className="flex flex-col gap-1" data-kind={statement.kind}>
      <p className="type-ui-sm">
        {prefix && <KindPrefix kind={statement.kind} prefix={prefix} />}
        {nodes}
      </p>
      {statement.finding && (
        <AgentFindingCard
          finding={statement.finding}
          onPropose={propose ?? undefined}
        />
      )}
      {(sources.size > 0 || others.length > 0) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {[...sources].map(([source, ref]) => (
            <SourceCitation
              key={source}
              source={source}
              claim={ref}
              open={open}
            />
          ))}
          {others.map((ref) => {
            const label =
              (ref.type === "feature" ? name(ref.id) : null) ??
              ref.label ??
              "Open"
            return (
              <button
                key={`${ref.type}:${ref.id}`}
                type="button"
                onClick={() => open(ref)}
                className="flex items-center gap-1 rounded-sm type-ui-xs-medium text-primary outline-none hover:underline focus-visible:shadow-focus-ring"
              >
                <Icon name="line" className="size-3" />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
