import { cn } from "@/lib/utils"

export type LineKind = "solid" | "dotted" | "dashed" | "ghost" | "selected"

/**
 * A line drawn the way the map draws it. solid and dotted follow the status
 * of a section, as set in Settings. dashed: proposed path. ghost: another
 * edition.
 */
export function LineKey({
  kind,
  className,
}: {
  kind: LineKind
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
      {kind === "selected" && (
        <path d="M0 8H28" strokeWidth={6} className="stroke-selected" />
      )}
      <path
        d="M0 8H28"
        strokeWidth={kind === "ghost" ? 1 : 2}
        strokeDasharray={
          kind === "dotted" ? "0.1 4" : kind === "dashed" ? "5 3" : undefined
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
