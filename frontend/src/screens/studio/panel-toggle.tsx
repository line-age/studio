import { Icon } from "@/components/icons/icon"
import { MapControl } from "@/components/map-control"
import { Button } from "@/components/ui/button"

import { useLeftPanel } from "./left-panel-context"

/*
 * One button hides both side panels and one brings them back. The first sits
 * at the right of the left panel's header; once the panels are hidden, the
 * same icon floats at the top left of the map. The rail stays either way.
 * Focus follows from one button to the other, so the keyboard is not left
 * inside a hidden panel.
 */
const HIDE_PANELS_ID = "studio-hide-panels"
const SHOW_PANELS_ID = "studio-show-panels"

function focusNext(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

export function HidePanels() {
  const { toggleOpen } = useLeftPanel()
  return (
    <Button
      id={HIDE_PANELS_ID}
      variant="ghost"
      size="icon-sm"
      aria-label="Hide the side panels"
      className="text-muted-foreground"
      onClick={() => {
        toggleOpen()
        focusNext(SHOW_PANELS_ID)
      }}
    >
      <Icon name="panel-left" />
    </Button>
  )
}

export function ShowPanels({ className }: { className?: string }) {
  const { toggleOpen } = useLeftPanel()
  return (
    <MapControl className={className}>
      <Button
        id={SHOW_PANELS_ID}
        variant="ghost"
        size="icon"
        aria-label="Show the side panels"
        onClick={() => {
          toggleOpen()
          focusNext(HIDE_PANELS_ID)
        }}
      >
        <Icon name="panel-left" />
      </Button>
    </MapControl>
  )
}
