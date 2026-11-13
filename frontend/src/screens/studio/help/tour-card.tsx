import { useEffect, useId, useRef, type CSSProperties, type Ref } from "react"

import { Button } from "@/components/ui/button"

/**
 * One step of the Help tour: what the highlighted area is and how to move
 * on. The first step has no Back; the last ends with Done and has no Skip.
 * Focus goes to the button that moves on, and stays inside the card.
 */
export function TourCard({
  ref,
  title,
  body,
  index,
  count,
  style,
  onNext,
  onBack,
  onSkip,
}: {
  ref?: Ref<HTMLDivElement>
  title: string
  body: string
  /** The step, from 0. */
  index: number
  count: number
  style?: CSSProperties
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const titleId = useId()
  const bodyId = useId()
  const forward = useRef<HTMLButtonElement>(null)
  const first = index === 0
  const last = index === count - 1

  useEffect(() => {
    // After whatever had the focus has let go of it (a closing dialog).
    const frame = requestAnimationFrame(() => forward.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [index])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-tour-card
      style={style}
      className="fixed z-50 flex w-80 flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-popover"
    >
      <h2 id={titleId} className="type-ui-sm-semibold">
        {title}
      </h2>
      <p id={bodyId} className="type-ui-sm text-muted-foreground">
        {body}
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="type-ui-xs text-muted-foreground">
          {index + 1} of {count}
        </span>
        <div className="flex items-center gap-1.5">
          {!last && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
          )}
          {!first && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button ref={forward} size="sm" onClick={onNext}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}
