import { useRef, useState } from "react"

import { Icon } from "@/components/icons/icon"
import { LayerRow } from "@/components/layer-row"
import { LineKey } from "@/components/line-key"
import { MapControl } from "@/components/map-control"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"

import { useStudio, type LayerId } from "../studio-store"

/**
 * The map key, behind one button among the map controls: how each line is
 * drawn and what that means. Every section is solid: heavy in a pipeline,
 * thin in none (Figma section 24). Two of the lines can be hidden, each with
 * its eye; the eyes belong to the map and do not filter the list.
 */
export function MapKey() {
  const layers = useStudio((s) => s.layers)
  const toggleLayer = useStudio((s) => s.toggleLayer)
  return <MapKeyPopover layers={layers} onToggleLayer={toggleLayer} />
}

/** The map key's button and what it opens, given all it shows. */
export function MapKeyPopover({
  layers,
  onToggleLayer,
}: {
  /** Which of the two lines that can be hidden are shown. */
  layers: Record<LayerId, boolean>
  /** An eye was pressed: show or hide that line on the map. */
  onToggleLayer: (layer: LayerId) => void
}) {
  const [open, setOpen] = useState(false)
  const popup = useRef<HTMLDivElement>(null)

  return (
    <MapControl>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Map key">
              <Icon name="layers" />
            </Button>
          }
        />
        {/* Opening it is to read it: the cursor goes to the key as a whole,
            not to the first eye, which would light up as if it were chosen. */}
        <PopoverContent
          ref={popup}
          tabIndex={-1}
          initialFocus={popup}
          side="left"
          align="start"
          className="w-72 gap-2 p-2"
        >
          <PopoverTitle className="px-2 pt-1 type-ui-xs-medium text-muted-foreground">
            Map key
          </PopoverTitle>
          <ul className="flex flex-col gap-0.5">
            <LayerRow
              name="Sections in a pipeline"
              lineKey={<LineKey kind="heavy" />}
            />
            <LayerRow
              name="Sections in no pipeline"
              lineKey={<LineKey kind="thin" />}
            />
            <LayerRow
              name="Proposed path or end"
              label="proposed paths and ends"
              lineKey={<LineKey kind="dashed" />}
              visible={layers.proposed}
              onVisibleChange={() => onToggleLayer("proposed")}
            />
            <LayerRow name="Selected" lineKey={<LineKey kind="selected" />} />
            <LayerRow
              name="Left out by the filters"
              label="sections left out by the filters"
              lineKey={<LineKey kind="ghost" />}
              visible={layers.faint}
              onVisibleChange={() => onToggleLayer("faint")}
            />
          </ul>
          <p className="px-2 pb-1 type-ui-xs text-muted-foreground">
            Every section is drawn solid. Heavy or thin says whether it is in a
            pipeline; dashes say what waits for a person.
          </p>
        </PopoverContent>
      </Popover>
    </MapControl>
  )
}
