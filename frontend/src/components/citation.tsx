import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** One field of an open citation: a quiet label, then the words as recorded. */
function Field({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex gap-2 border-b border-border-subtle py-1.5 pr-3 pl-8.5">
      <dt className="w-18 shrink-0 py-0.5 type-ui-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 type-ui-sm break-words">{children}</dd>
    </div>
  )
}

/**
 * One source supporting one claim. Closed: the source's title and what it
 * does for the claim ("Shown on", "Not on", "States"). Open: for a map its
 * edition and date, where in the source, the passage in the source's own
 * words (never paraphrased), and last the trace file a map reading was drawn
 * in. A source with none of these recorded has nothing to open.
 */
export function Citation({
  source,
  role,
  edition,
  locator,
  quote,
  file,
  open,
  onToggle,
}: {
  source: string
  /** What the source does for the claim, in words. */
  role?: string
  /** A map's edition and the date it is as of. */
  edition?: string
  locator?: string
  quote?: string
  /** The trace file, for a reading off a map. Not a place in the source. */
  file?: string
  open: boolean
  onToggle: () => void
}) {
  const hasDetail =
    edition !== undefined ||
    locator !== undefined ||
    quote !== undefined ||
    file !== undefined
  const title = (
    <>
      <span className="min-w-0 flex-1 truncate type-ui-sm">{source}</span>
      {role !== undefined && (
        <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
          {role}
        </span>
      )}
    </>
  )
  const row =
    "flex h-9 w-full items-center gap-2 border-b border-border-subtle px-3 text-left"
  return (
    <li className="flex flex-col">
      {hasDetail ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={cn(
            row,
            "transition-colors duration-100 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid"
          )}
        >
          <Icon
            name={open ? "chevron-down" : "chevron-right"}
            className="size-3.5 text-muted-foreground"
          />
          {title}
        </button>
      ) : (
        <div className={row}>
          <Icon name="source" className="size-3.5 text-muted-foreground" />
          {title}
        </div>
      )}
      {hasDetail && open && (
        <dl className="flex flex-col">
          {edition !== undefined && <Field label="Edition">{edition}</Field>}
          {locator !== undefined && <Field label="Where">{locator}</Field>}
          {quote !== undefined && <Field label="Quote">{quote}</Field>}
          {file !== undefined && <Field label="File">{file}</Field>}
        </dl>
      )}
    </li>
  )
}
