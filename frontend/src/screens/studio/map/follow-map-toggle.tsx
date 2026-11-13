import { Icon } from "@/components/icons/icon"
import { MapControl } from "@/components/map-control"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { useStudio } from "../studio-store"

/**
 * "List follows the map": on, the list holds only what is in the part of the
 * map on screen and changes as the map moves; off, it holds the whole edition.
 * While the list is open as a table, following waits: the button stays as
 * chosen, is marked as paused and takes up again when the table closes.
 */
export function FollowMapToggle() {
  const on = useStudio((s) => s.onlyInView)
  const setOn = useStudio((s) => s.setOnlyInView)
  const paused = useStudio((s) => s.tableOpen) && on
  return (
    <MapControl>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="List follows the map"
              aria-pressed={on}
              aria-description={
                paused ? "Paused while the table is open" : undefined
              }
              data-paused={paused || undefined}
              className="aria-pressed:bg-selected aria-pressed:text-selected-foreground data-paused:bg-transparent data-paused:text-muted-foreground data-paused:outline-1 data-paused:-outline-offset-4 data-paused:outline-border data-paused:outline-dashed"
              onClick={() => setOn(!on)}
            >
              <Icon name="in-view" />
            </Button>
          }
        />
        <TooltipContent side="left">
          {paused
            ? "Paused while the list is a table: the table shows the whole edition. Following takes up again when you show it as a list."
            : on
              ? "The list shows only what is in this view. Click to list the whole edition."
              : "The list shows the whole edition. Click to list only what is in this view."}
        </TooltipContent>
      </Tooltip>
    </MapControl>
  )
}
