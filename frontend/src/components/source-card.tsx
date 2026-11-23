import type { ComponentProps, ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

/**
 * One source of a claim, as a card in the sources pop-up (Figma `SourceCard`,
 * `488:19870`): what kind of source it is, its title, where in it, the words
 * it says, a quiet note, and a link when it has an address.
 */
export function SourceCard({
  kind,
  title,
  where,
  quote,
  note,
  href,
  ...props
}: Omit<ComponentProps<"li">, "title"> & {
  /** What kind of source, one word: Map, Journal, Source. */
  kind: string
  /** The source's title, once and in full. */
  title: string
  /** Where in it and what it does for the claim, as one line. */
  where?: string
  /** The words the source says, when it quotes any. */
  quote?: string
  /** A quiet note under it: no quote on a scan, or whose record it is. */
  note?: ReactNode
  /** The source's own address or an archived copy. */
  href?: string
}) {
  return (
    <li
      {...props}
      className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">{kind}</Badge>
        {href !== undefined && (
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="rounded-sm type-ui-xs-medium text-link underline-offset-2 outline-none hover:underline focus-visible:shadow-focus-ring"
          >
            Open source
          </a>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-ui-sm-medium break-words">{title}</span>
        {where !== undefined && (
          <span className="type-ui-xs break-words text-muted-foreground">
            {where}
          </span>
        )}
      </div>
      {quote !== undefined && (
        <blockquote className="rounded-md bg-muted px-2.5 py-2 type-ui-xs break-words">
          {quote}
        </blockquote>
      )}
      {note !== undefined && (
        <p className="type-ui-xs text-muted-foreground">{note}</p>
      )}
    </li>
  )
}
