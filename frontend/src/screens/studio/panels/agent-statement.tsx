import { BY_HAND_SOURCE } from "@/data/evidence"
import { createContext, use, type ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

import { useStudio } from "../studio-store"
import { AgentChangeCard } from "./agent-change-card"
import { AgentFindingCard } from "./agent-finding"
import { AgentSearchCard } from "./agent-search-card"

/** Proposes a finding by its handle; null while nothing may be sent. */
export const ProposeFinding = createContext<
  ((handle: string, target?: string) => void) | null
>(null)

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
  lead: "Lead, not a fact",
}

/** What a prefix means, shown on hover or focus. */
export const KIND_MEANS: Partial<Record<AgentStatement["kind"], string>> = {
  worked_out:
    "Concluded from what store holds, such as which maps show the line. No source states this, so it is not a claim.",
}

/**
 * The labels an answer may open a line with, so every answer has the same
 * shape: what is known, what is proposed, what is not known, what the map
 * shows. A line that starts with one is drawn with the label set apart.
 */
const LABELS = [
  "Known",
  "Proposed",
  "Not known",
  "On the map",
  "Same",
  "Different",
  "Sections",
  "Where to look",
] as const
const LABELLED = new RegExp(`^(${LABELS.join("|")}):\\s+(.*)$`)

/**
 * A text with line breaks: a blank line starts a paragraph, lines starting
 * "- " are a bulleted list, and a line starting with one of LABELS is a
 * labelled line. `inline` turns a line's words into nodes (names as links).
 */
function TextBlocks({
  text,
  inline = (line) => line,
}: {
  text: string
  inline?: (line: string) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n")
        const items = lines.filter((l) => l.startsWith("- "))
        const rest = lines.filter((l) => !l.startsWith("- "))
        const labelled = rest.filter((l) => LABELLED.test(l))
        const lead = rest.filter((l) => !LABELLED.test(l))
        return (
          <div key={i} className="flex flex-col gap-1">
            {lead.length > 0 && (
              <p className="type-ui-sm">{inline(lead.join(" "))}</p>
            )}
            {labelled.map((line) => {
              const [, label, words] = LABELLED.exec(line)!
              return (
                <p key={line} className="type-ui-sm">
                  <span className="font-medium text-muted-foreground">
                    {label}
                  </span>
                  {" · "}
                  {inline(words)}
                </p>
              )
            })}
            {items.length > 0 && (
              <ul className="flex list-disc flex-col gap-0.5 pl-5 type-ui-sm">
                {items.map((item) => (
                  <li key={item}>{inline(item.slice(2))}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
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

/** Said on a name Studio cannot open: the area it loaded leaves it out. */
export const NOT_LOADED =
  "Not open in Studio: it lies outside the area Studio loaded."

/**
 * The sentence with every name it holds turned into a link. A name Studio
 * has not loaded (`loaded` false) stays plain text, with why on hover: a link
 * that does nothing would look broken.
 */
function withLinks(
  text: string,
  names: Map<string, AgentAnswerRef>,
  open: (ref: AgentAnswerRef) => void,
  loaded: (id: string) => boolean
): { nodes: ReactNode[]; linked: Set<string> } {
  const linked = new Set<string>()
  const keys = [...names.keys()].sort((a, b) => b.length - a.length)
  if (keys.length === 0) return { nodes: [text], linked }
  const pattern = new RegExp(`(${keys.map(escape).join("|")})`, "g")
  const nodes = text.split(pattern).map((part, i) => {
    const ref = names.get(part)
    if (!ref) return part
    linked.add(ref.id)
    if (!loaded(ref.id))
      return (
        <span key={i} title={NOT_LOADED}>
          {part}
        </span>
      )
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

/** A claim's state as Studio shows it everywhere: a coloured badge with its word. */
const STATE_BADGE: Record<
  string,
  { word: string; variant: "cited" | "ai" | "destructive" }
> = {
  accepted: { word: "Cited", variant: "cited" },
  candidate: { word: "Proposed", variant: "ai" },
  rejected: { word: "Rejected", variant: "destructive" },
}

/** What the source does for the claim, in Studio's words ("Shown on", "States"). */
function roleLine(claim: AgentAnswerRef): string | null {
  const year = claim.as_of?.match(/^\d{4}/)?.[0]
  switch (claim.role) {
    case "map_shows":
      return year ? `Shown on this map, as of ${year}` : "Shown on this map"
    case "map_omits":
      return year ? `Not on this map, as of ${year}` : "Not on this map"
    case "states":
      return "States it"
    case "confirms":
      return "Confirms it"
    default:
      return null
  }
}

/**
 * A source a statement rests on, as AI Elements' Inline Citation: the pill
 * opens the claim it was cited for; hovering it shows what the source does for
 * the claim, the source, the passage it quotes, the claim's state, and a link to
 * the source, without leaving the chat.
 */
/** The source Studio saves a hand-typed value under (data/store/write-edits.ts). */

function SourceCitation({
  source,
  claim,
  open,
}: {
  source: string
  claim: AgentAnswerRef
  open: (ref: AgentAnswerRef) => void
}) {
  // A value typed into Studio's Edit form is saved under the source "Studio
  // edit", because every value needs one. It is not a citation and is not shown
  // as one: nothing was cited.
  const byHand = source === BY_HAND_SOURCE
  const shown = byHand ? "Entered by hand" : source
  const state = claim.status && !byHand ? STATE_BADGE[claim.status] : undefined
  const role = byHand
    ? "Entered by hand in Studio. No source is cited."
    : roleLine(claim)
  const link =
    "type-ui-xs-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:shadow-focus-ring rounded-sm"
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={
              byHand
                ? "Entered by hand, open it"
                : `Open the citation, from ${source}`
            }
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
          <span className="truncate">{shown}</span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="flex w-80 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          {role && (
            <span className="flex items-center gap-1.5 type-ui-xs text-muted-foreground">
              <Icon name="source" className="size-3.5" />
              {role}
            </span>
          )}
          <span className="type-ui-sm-medium">{shown}</span>
        </div>
        {claim.quote && (
          <blockquote
            title={claim.quote}
            className="line-clamp-6 border-l-2 border-border pl-2 type-ui-xs"
          >
            “{claim.quote}”
          </blockquote>
        )}
        {(state || claim.label) && (
          <div className="flex items-center gap-1.5">
            {state && <Badge variant={state.variant}>{state.word}</Badge>}
            {claim.label && (
              <span className="type-ui-xs text-muted-foreground">
                {claim.label}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-border-subtle pt-2">
          <button type="button" onClick={() => open(claim)} className={link}>
            {byHand ? "Open it" : "Open the citation"}
          </button>
          {claim.url && (
            <a
              href={claim.url}
              target="_blank"
              rel="noreferrer"
              className={link}
            >
              Open the source
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
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
  subject,
}: {
  statement: AgentStatement
  name: (id: string) => string | null
  open: (ref: AgentAnswerRef) => void
  /** The one thing the question was about: the sentence calls it "it". */
  subject?: string
}) {
  const propose = use(ProposeFinding)
  const edit = useStudio((s) => s.edit)
  // The form's fields are named as Studio shows them: "Diameter", "Owner".
  const openEdit = (offer: NonNullable<AgentStatement["edit"]>) => {
    const field =
      offer.attribute.charAt(0).toUpperCase() + offer.attribute.slice(1)
    const prefill = { [field]: offer.value }
    edit(
      offer.target === "pipeline"
        ? { kind: "edit-pipeline", pipelineId: offer.feature_ids[0], prefill }
        : { kind: "edit-sections", sectionIds: offer.feature_ids, prefill }
    )
  }
  // A card says it all: its title is the sentence (Figma sections 28, 29).
  if (statement.kind === "change_offer" && statement.change)
    return <AgentChangeCard title={statement.text} offer={statement.change} />
  if (statement.kind === "search_offer" && statement.search)
    return <AgentSearchCard title={statement.text} offer={statement.search} />
  const prefix = KIND_PREFIX[statement.kind]
  // Only what Studio has loaded can be opened.
  const loaded = (id: string) => name(id) !== null
  const names = namesIn(statement.refs, name)
  const { nodes, linked } = withLinks(statement.text, names, open, loaded)
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
      (ref.type === "feature" &&
        ref.id !== subject &&
        !linked.has(ref.id) &&
        loaded(ref.id)) ||
      ref.type === "link"
  )
  return (
    <div className="flex flex-col gap-1" data-kind={statement.kind}>
      {statement.text.includes("\n") ? (
        <TextBlocks
          text={statement.text}
          inline={(line) => withLinks(line, names, open, loaded).nodes}
        />
      ) : (
        <p className="type-ui-sm">
          {prefix && <KindPrefix kind={statement.kind} prefix={prefix} />}
          {nodes}
        </p>
      )}
      {statement.kind === "edit_offer" && statement.edit && (
        <div className="flex">
          <Button size="sm" onClick={() => openEdit(statement.edit!)}>
            Open Edit
          </Button>
        </div>
      )}
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
