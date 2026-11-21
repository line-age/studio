import { cn } from "@/lib/utils"

export type LineKind = "solid" | "dotted" | "dashed" | "ghost" | "selected"

/**
 * A line drawn the way the map draws it. solid and dotted follow the status
 * of a section, as set in Settings. dashed: proposed path. ghost: a section
 * the filters leave out. With a `weight`, a solid line that heavy: how the
 * map tells a section in a pipeline from one in none.
 */
export function LineKey({
  kind,
  weight,
  className,
}: {
  kind: LineKind
  /** How heavy the line is, where that is what the key shows. */
  weight?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 28 16"
      aria-hidden="true"
      className={cn("h-4 w-7 shrink-0", className)}
      fill="none"
      strokeLinecap={kind === "dotted" ? "round" : "butt"}
    >
      <path
        // A round dot at the very edge would be cut in half.
        d={kind === "dotted" ? "M2 8H28" : "M0 8H28"}
        strokeWidth={
          weight !== undefined
            ? weight
            : kind === "ghost"
              ? 1
              : kind === "selected"
                ? 4
                : kind === "dotted"
                  ? 2.5
                  : 2
        }
        strokeDasharray={
          kind === "dotted" ? "0.1 5.5" : kind === "dashed" ? "5 3" : undefined
        }
        className={cn(
          kind === "ghost" && "stroke-map-ghost",
          kind === "dashed" && "stroke-map-proposed",
          kind === "selected" && "stroke-map-selected",
          (kind === "solid" || kind === "dotted") && "stroke-map-line"
        )}
      />
    </svg>
  )
}
