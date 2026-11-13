import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { useLeftPanel } from "../left-panel-context"
import { useStudioData } from "../studio-data"
import { useStudio, type LeftPanel } from "../studio-store"

import { HELP_BUTTON_ID, useHelp } from "./help-store"
import { cardPosition, ringBox, type Box } from "./place"
import { HELP_STEPS, type HelpStep } from "./steps"
import { TourCard } from "./tour-card"

/** How long a step waits for its area to come on screen before it is passed over. */
const FRAMES_TO_WAIT = 30

/** The step's area, if it is on screen and not inside a hidden panel. */
function findTarget(step: HelpStep): HTMLElement | null {
  for (const name of step.targets) {
    const element = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
    if (element && !element.closest("[inert]")) return element
  }
  return null
}

interface Drawn {
  ring: Box | null
  card: { left: number; top: number }
}

const same = (a: Drawn | null, b: Drawn) =>
  a !== null &&
  a.card.left === b.card.left &&
  a.card.top === b.card.top &&
  (a.ring === b.ring ||
    (a.ring !== null &&
      b.ring !== null &&
      a.ring.left === b.ring.left &&
      a.ring.top === b.ring.top &&
      a.ring.width === b.ring.width &&
      a.ring.height === b.ring.height))

/**
 * The Help tour. It starts by itself on a first visit and from Help. Each
 * step brings its area on screen, rings it, and covers the rest; the screen
 * under it cannot be used until the tour ends. A step whose area is not
 * there (no map, an empty network) is passed over.
 */
export function Tour() {
  const step = useHelp((s) => s.step)

  // First visit: once the data is on screen, and only until seen.
  useEffect(() => {
    const help = useHelp.getState()
    if (!help.seen && help.step === null) help.start()
  }, [])

  // What the tour changed to show its steps, put back when it ends.
  const before = useRef<{
    open: boolean
    panel: LeftPanel
    borrowed: string | null
  } | null>(null)
  const { open, panel, openPanel, toggleOpen } = useLeftPanel()
  const { everySection: summaries } = useStudioData()
  const running = step !== null

  useEffect(() => {
    if (running) {
      before.current = { open, panel, borrowed: null }
      return
    }
    const was = before.current
    before.current = null
    if (!was) return
    const studio = useStudio.getState()
    if (
      was.borrowed &&
      studio.selection.size === 1 &&
      studio.selection.has(was.borrowed)
    ) {
      studio.select([])
    }
    if (was.open && was.panel !== panel) openPanel(was.panel)
    else if (!was.open && open) toggleOpen()
    requestAnimationFrame(() =>
      document.getElementById(HELP_BUTTON_ID)?.focus()
    )
    // Only when the tour starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Bring the step's area on screen.
  useEffect(() => {
    if (step === null) return
    const needs = HELP_STEPS[step].needs
    if (needs === "list" && (!open || panel !== "pipelines")) {
      openPanel("pipelines")
    }
    if (needs === "agent" && (!open || panel !== "agent")) openPanel("agent")
    if (needs === "selection") {
      if (!open) openPanel(panel)
      const studio = useStudio.getState()
      const first = summaries.flatMap((s) => s.sections)[0]
      if (studio.selection.size === 0 && first) {
        studio.select([first.id])
        if (before.current) before.current.borrowed = first.id
      }
    }
    // Once per step: what the person does during it is left alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (step === null) return null
  return <Running key={step} index={step} />
}

function Running({ index }: { index: number }) {
  const step = HELP_STEPS[index]
  const next = useHelp((s) => s.next)
  const back = useHelp((s) => s.back)
  const end = useHelp((s) => s.end)
  const card = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  // Follow the area: panels slide and resize, the window changes.
  useEffect(() => {
    let frame = 0
    let waited = 0
    let last: Drawn | null = null
    const follow = () => {
      const target = findTarget(step)
      if (!target && step.targets.length > 0) {
        waited += 1
        if (waited > FRAMES_TO_WAIT) {
          // The area is not there: on to the next one, the way we were going.
          const help = useHelp.getState()
          if (help.direction === 1) help.next()
          else help.back()
          return
        }
      } else {
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        }
        const ring = target
          ? ringBox(target.getBoundingClientRect(), viewport)
          : null
        const size = {
          width: card.current?.offsetWidth ?? 0,
          height: card.current?.offsetHeight ?? 0,
        }
        const now = { ring, card: cardPosition(ring, size, viewport) }
        if (!same(last, now)) {
          last = now
          setDrawn(now)
        }
      }
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [step])

  // The keyboard belongs to the tour while it runs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        end()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        next()
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        back()
      } else if (event.key === "Tab") {
        // Focus stays among the card's buttons.
        const buttons = [
          ...(card.current?.querySelectorAll<HTMLElement>("button") ?? []),
        ]
        if (buttons.length === 0) return
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        const to = event.shiftKey
          ? at <= 0
            ? buttons.length - 1
            : at - 1
          : at === buttons.length - 1
            ? 0
            : at + 1
        event.preventDefault()
        buttons[to].focus()
      } else if (event.key !== "Enter" && event.key !== " ") {
        // Nothing under the tour hears the keyboard ("/" for the search).
        event.stopPropagation()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [next, back, end])

  return createPortal(
    <>
      {/* Covers the screen so nothing under the tour can be pressed. */}
      <div
        data-tour-overlay
        className={
          drawn?.ring ? "fixed inset-0 z-50" : "fixed inset-0 z-50 bg-overlay"
        }
      />
      {drawn?.ring && (
        <div
          data-tour-ring
          style={drawn.ring}
          className="pointer-events-none fixed z-50 rounded-md shadow-[0_0_0_100vmax_var(--overlay)] ring-2 ring-ring"
        />
      )}
      <TourCard
        ref={card}
        title={step.title}
        body={step.body}
        index={index}
        count={HELP_STEPS.length}
        // Out of sight for the frame before it is placed.
        style={drawn ? drawn.card : { visibility: "hidden" }}
        onNext={next}
        onBack={back}
        onSkip={end}
      />
    </>,
    document.body
  )
}
