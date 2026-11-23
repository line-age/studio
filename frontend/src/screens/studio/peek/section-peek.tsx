import { createPortal } from "react-dom"

import { sectionFacts } from "@/data/section-facts"
import { cn } from "@/lib/utils"

import { useStudioData } from "../studio-data"
import { SectionCard } from "./section-card"
import { placePeek, type Peek } from "./use-peek"

/**
 * The hover card of the section being pointed at, on the map or in a list
 * (Figma section 27, `524:23541`). It comes in with a light fade and goes
 * the same way. It takes no pointer: a click goes to what is under it, and
 * the selection, the right panel and the link stay as they are.
 */
export function SectionPeek({ peek }: { peek: Peek | null }) {
  const { network, sectionById } = useStudioData()
  const section = peek ? sectionById.get(peek.id) : undefined
  if (!peek || !section) return null
  return createPortal(
    <SectionCard
      // A new section's card comes in afresh.
      key={peek.id}
      {...sectionFacts(section, network)}
      style={placePeek(peek.anchor, window.innerHeight)}
      className={cn(
        "pointer-events-none fixed z-50 duration-100",
        peek.leaving
          ? "animate-out fade-out-0 fill-mode-forwards motion-safe:zoom-out-95"
          : "animate-in fade-in-0 motion-safe:zoom-in-95"
      )}
    />,
    document.body
  )
}
