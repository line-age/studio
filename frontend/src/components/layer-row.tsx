import type { ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * One thing drawn on the map: its key, name, what it means and, where it
 * can be hidden, an eye.
 */
export function LayerRow({
  name,
  meta,
  label,
  lineKey,
  visible,
  onVisibleChange,
  disabled = false,
  className,
}: {
  name: string
  meta: ReactNode
  /** What the eye shows, when the name alone does not say: "proposed paths". */
  label?: string
  /** A LineKey, or nothing when the layer has no key symbol yet. */
  lineKey?: ReactNode
  /** Left out for a line that is always drawn: the row then has no eye. */
  visible?: boolean
  onVisibleChange?: (visible: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <li
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-lg py-2 pr-2 pl-2.5 transition-colors duration-100 hover:bg-muted",
        className
      )}
    >
      <span className="flex w-7 shrink-0 justify-center">{lineKey}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate type-ui-sm",
            visible === false && "text-muted-foreground"
          )}
        >
          {name}
        </span>
        <span className="truncate type-ui-xs text-muted-foreground">
          {meta}
        </span>
      </span>
      {visible !== undefined && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={visible}
          aria-label={`Show ${label ?? name} on the map`}
          disabled={disabled}
          className="text-muted-foreground"
          onClick={() => onVisibleChange?.(!visible)}
        >
          <Icon name={visible ? "eye" : "eye-off"} className="size-3.5" />
        </Button>
      )}
    </li>
  )
}
