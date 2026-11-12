import { cn } from "@/lib/utils"

/**
 * Thin bar across the very top while the screen or network loads. It runs
 * most of the way while loading, completes and fades when done. Never blocks.
 */
export function LoadBar({
  loading,
  className,
}: {
  loading: boolean
  className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-busy={loading}
      aria-valuetext={loading ? "Loading" : "Loaded"}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-50 h-0.75 overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "h-full origin-left bg-primary motion-reduce:transition-none",
          loading
            ? "w-3/5 transition-[width] duration-700 ease-out"
            : "w-full opacity-0 transition-[width,opacity] duration-300 ease-out"
        )}
      />
    </div>
  )
}
