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
 */
export function FollowMapToggle() {
  const on = useStudio((s) => s.onlyInView)
  const setOn = useStudio((s) => s.setOnlyInView)
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
              className="aria-pressed:bg-selected aria-pressed:text-selected-foreground"
              onClick={() => setOn(!on)}
            >
              <Icon name="in-view" />
            </Button>
          }
        />
        <TooltipContent side="left">
          {on
            ? "The list shows only what is in this view. Click to list the whole edition."
            : "The list shows the whole edition. Click to list only what is in this view."}
        </TooltipContent>
      </Tooltip>
    </MapControl>
  )
}
