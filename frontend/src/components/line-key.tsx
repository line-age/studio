import { cn } from "@/lib/utils"

/**
 * How heavy a section's line is says whether it is in a pipeline: heavy when
 * a person confirmed it part of one, thin when it is in none. Colour is not
 * used for this, and solid and dotted keep saying status. The two weights,
 * in map pixels; change them here and the map and its key follow.
 */
export const LINE_WEIGHT = { placed: 3.5, unplaced: 1.5 } as const

export type LineKind =
  "solid" | "dotted" | "dashed" | "ghost" | "selected" | "heavy" | "thin"

/**
 * A line drawn the way the map draws it. solid and dotted follow the status
 * of a section, as set in Settings. dashed: proposed path. ghost: a section
 * the filters leave out. heavy and thin: a solid line as heavy as the map
 * draws a section in a pipeline, and one in none (Figma `LineKey`, `80:422`).
 */
export function LineKey({
  kind,
  className,
}: {
  /** Which line: solid, dotted, heavy, thin, dashed, ghost or selected. */
  kind: LineKind
  /** Extra classes for its box, which is 28 by 16. */
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
          kind === "heavy"
            ? LINE_WEIGHT.placed
            : kind === "thin"
              ? LINE_WEIGHT.unplaced
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
          (kind === "solid" ||
            kind === "dotted" ||
            kind === "heavy" ||
            kind === "thin") &&
            "stroke-map-line"
        )}
      />
    </svg>
  )
}
