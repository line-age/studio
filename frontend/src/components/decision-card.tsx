import type { ReactNode } from "react"

import { Icon, type IconName } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/*
 * One card for everything in the chat that waits on a press (Figma section
 * 28, board A `532:23604`, states board B `532:23763`): a dot and a title that
 * says the change in plain words, one line saying whose it is and what the
 * press does, a grey block with exactly what will be written, then the
 * buttons. Once pressed, an outcome line says what came of it, with its word.
 * Used for a change asked for in words, a search before it runs, what cite
 * found, and what a tool proposed (section 29).
 *
 * Compound: `DecisionCard` holds `DecisionCardHead`, `DecisionCardRows` (of
 * `DecisionCardRow`), `DecisionCardDoubt`, `DecisionCardProgress`,
 * `DecisionCardOutcome` and `DecisionCardActions`, in that order, each only
 * when it has something to say.
 */

/** Whose it is: the dot's colour. Grey once nothing more can happen to it. */
export type DecisionBy = "you" | "agent" | "closed"

const DOT: Record<DecisionBy, string> = {
  you: "bg-primary",
  agent: "bg-state-ai",
  closed: "bg-muted-foreground",
}

/** The card. `label` names it for a screen reader: its title is a good one. */
export function DecisionCard({
  by,
  label,
  className,
  children,
}: {
  /** Whose the change is: the person's (blue), the Agent's or a tool's (purple). */
  by: DecisionBy
  /** What the card is, for a screen reader. */
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <article
      aria-label={label}
      data-by={by}
      className={cn(
        "group/decision flex w-full max-w-140 flex-col gap-2.5 rounded-xl border border-border bg-card p-3",
        className
      )}
    >
      {children}
    </article>
  )
}

/** The dot, the title and whose it is; an optional link at the end (Open page). */
export function DecisionCardHead({
  by,
  title,
  who,
  aside,
}: {
  by: DecisionBy
  /** The change in plain words: "Add 4 sections to Tolland lateral". */
  title: string
  /** Whose it is and what the press does: "Your change. Made when you approve." */
  who: string
  /** A link beside the title, such as Open page. */
  aside?: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="flex h-5 w-2 shrink-0 items-center">
        <span className={cn("size-2 rounded-full", DOT[by])} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 break-words">
        <h3 className="type-ui-sm-medium">{title}</h3>
        <p className="type-ui-xs text-muted-foreground">{who}</p>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  )
}

/** The grey block: exactly what will be written, one row a thing. */
export function DecisionCardRows({ children }: { children: ReactNode }) {
  return (
    <dl className="flex flex-col gap-1.5 rounded-md bg-muted px-3 py-2.5 type-ui-xs break-words">
      {children}
    </dl>
  )
}

/**
 * One row: its label, then the value. `code` sets the value in mono and the
 * link colour, for sections and pipelines by name and code; a value that opens
 * something passes a button as `children`.
 */
export function DecisionCardRow({
  label,
  code = false,
  children,
}: {
  label: string
  /** Sections and pipelines: mono, in the link colour (Figma). */
  code?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1",
          code ? "type-ui-mono-xs text-link" : "text-foreground"
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/** Why it is in doubt, in the Unknown colour with its words. */
export function DecisionCardDoubt({ children }: { children: ReactNode }) {
  return <p className="type-ui-xs text-state-unknown-foreground">{children}</p>
}

/**
 * A search while it runs: its steps (the last one still going) and a bar.
 * cite gives no share done, so the bar moves without a number.
 */
export function DecisionCardProgress({
  steps,
  label,
}: {
  /** What it has done so far, in plain words; the last is the one going on. */
  steps: readonly string[]
  /** What the bar is, for a screen reader: "Searching the journals". */
  label: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col gap-1.5 type-ui-xs text-muted-foreground">
        {steps.map((step, i) => (
          <li key={`${i}:${step}`} className="flex items-center gap-1.5">
            <Icon
              name={i === steps.length - 1 ? "history" : "check"}
              className="size-3.5 shrink-0"
            />
            {step}
          </li>
        ))}
      </ol>
      <div
        role="progressbar"
        aria-label={label}
        aria-busy
        className="h-0.75 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-3/5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
      </div>
    </div>
  )
}

/** What came of a press, with its word and colour. */
export type DecisionTone =
  "done" | "failed" | "out-of-date" | "closed" | "proposed" | "waiting"

const TONE: Record<
  DecisionTone,
  { icon: IconName | null; title: string; iconColour: string }
> = {
  done: {
    icon: "check",
    title: "text-state-cited-foreground",
    iconColour: "text-state-cited-foreground",
  },
  failed: {
    icon: "warning",
    title: "text-destructive",
    iconColour: "text-destructive",
  },
  "out-of-date": {
    icon: "history",
    title: "text-state-unknown-foreground",
    iconColour: "text-state-unknown-foreground",
  },
  closed: { icon: null, title: "text-muted-foreground", iconColour: "" },
  proposed: { icon: null, title: "text-state-ai-foreground", iconColour: "" },
  waiting: {
    icon: "history",
    title: "text-foreground",
    iconColour: "text-muted-foreground",
  },
}

/**
 * The outcome line: its word ("Done", "Couldn't save. Nothing was changed.")
 * and, under it, what happened. Announced when it appears.
 */
export function DecisionCardOutcome({
  tone,
  title,
  children,
}: {
  tone: DecisionTone
  /** The word for what came of it. */
  title: string
  /** What happened, in a sentence. */
  children?: ReactNode
}) {
  const { icon, title: titleColour, iconColour } = TONE[tone]
  return (
    <div role="status" className="flex items-start gap-1.5 type-ui-xs">
      {icon && (
        <span className="flex h-4 shrink-0 items-center">
          <Icon name={icon} className={cn("size-3.5", iconColour)} />
        </span>
      )}
      <div className="flex min-w-0 flex-col break-words">
        <span className={titleColour}>{title}</span>
        {children && <span className="text-muted-foreground">{children}</span>}
      </div>
    </div>
  )
}

/** The buttons, and an optional link at the far end (Change towns, Show the page). */
export function DecisionCardActions({
  children,
  aside,
}: {
  children?: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {children}
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  )
}

/** A link-styled button for the head or the actions' far end. */
export function DecisionCardLink({
  onClick,
  href,
  children,
}: {
  onClick?: () => void
  /** An address: the link opens it in a new tab. */
  href?: string
  children: ReactNode
}) {
  const className =
    "rounded-sm type-ui-xs-medium text-link underline-offset-2 outline-none hover:underline focus-visible:shadow-focus-ring"
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
}
