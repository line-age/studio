import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * One section in a modal's list (Figma `469:17275`): its code, its name,
 * what it is or will be (2/2 cited, New, Will be removed), and one action.
 * A section to be removed is struck through and faint, never dashed: dashed
 * means proposed.
 */
export function ModalSectionRow({
  code,
  name,
  state,
  tone = "default",
  action,
  onAction,
}: {
  /** The section's code, as the list shows it. */
  code: string
  /** Its name, when it has one. */
  name?: string | null
  /** What it is, or what Save will do to it. */
  state: ReactNode
  /** New rows read as added; removed rows are struck through and faint. */
  tone?: "default" | "added" | "removed"
  /** The row's button: Remove, or Undo. */
  action: string
  onAction: () => void
}) {
  const label = name ? `${code} ${name}` : code
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b px-3 py-2 last:border-b-0",
        tone === "removed" && "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex min-w-0 flex-1 items-baseline gap-2",
          tone === "removed" && "line-through"
        )}
      >
        <span className="shrink-0 type-ui-mono-xs">{code}</span>
        {name && <span className="truncate type-ui-sm">{name}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 type-ui-xs",
          tone === "added" ? "text-primary" : "text-muted-foreground"
        )}
      >
        {state}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`${action} ${label}`}
        onClick={onAction}
      >
        {action}
      </Button>
    </li>
  )
}
