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
 * One source supporting one claim. Closed: the source's title. Open: where in
 * the source, and the passage in the source's own words, never paraphrased.
 * A source with neither recorded has nothing to open.
 */
export function Citation({
  source,
  locator,
  quote,
  open,
  onToggle,
}: {
  source: string
  locator?: string
  quote?: string
  open: boolean
  onToggle: () => void
}) {
  const hasDetail = locator !== undefined || quote !== undefined
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
          <span className="truncate type-ui-sm">{source}</span>
        </button>
      ) : (
        <div className={row}>
          <Icon name="source" className="size-3.5 text-muted-foreground" />
          <span className="truncate type-ui-sm">{source}</span>
        </div>
      )}
      {hasDetail && open && (
        <dl className="flex flex-col">
          {locator !== undefined && <Field label="Where">{locator}</Field>}
          {quote !== undefined && <Field label="Quote">{quote}</Field>}
        </dl>
      )}
    </li>
  )
}
