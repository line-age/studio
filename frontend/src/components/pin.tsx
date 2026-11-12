import { cn } from "@/lib/utils"

/**
 * Numbered note pin. The same number is on the map and on the note in the
 * Agent panel.
 */
export function Pin({
  number,
  selected = false,
  className,
}: {
  number: number
  selected?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border border-map-pin-foreground bg-state-note type-ui-mono-2xs text-map-pin-foreground",
        selected && "border-2",
        className
      )}
    >
      {number}
    </span>
  )
}
