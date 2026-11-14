import type { ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { Badge } from "@/components/ui/badge"
import type { AgentAnswerRef, AgentStatement } from "@/data/agent/answer"

/*
 * One statement of an answer (Figma section 13). Each kind of thing has its
 * own look, so none is taken for another:
 *  - the kind, when it is not a claim: a grey prefix ("Worked out", "Lead,
 *    not in store");
 *  - a section the sentence names: a link in the text, which opens it;
 *  - what it rests on: a neutral pill with the source icon, the source and
 *    page; a click opens the claim. Its state is in the sentence's words.
 */

export const KIND_PREFIX: Partial<Record<AgentStatement["kind"], string>> = {
  worked_out: "Worked out",
  lead: "Lead, not in store",
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

export function AgentStatementView({
  statement,
  name,
  open,
}: {
  statement: AgentStatement
  name: (id: string) => string | null
  open: (ref: AgentAnswerRef) => void
}) {
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
        {prefix && (
          <span className="type-ui-sm-medium text-muted-foreground">
            {prefix} ·{" "}
          </span>
        )}
        {nodes}
      </p>
      {(sources.size > 0 || others.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[...sources].map(([source, ref]) => (
            <button
              key={source}
              type="button"
              aria-label={`Open the claim, from ${source}`}
              onClick={() => open(ref)}
              className="rounded-full outline-none focus-visible:shadow-focus-ring"
            >
              <Badge variant="secondary" className="hover:bg-secondary-hover">
                <Icon name="source" data-icon="inline-start" />
                {source}
              </Badge>
            </button>
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
