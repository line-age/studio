import { useState } from "react"

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
import { formatCount } from "@/data/derive"

import { useSettings, useSettingsOpen } from "../settings"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { legendText, styleName } from "./line-style"

/**
 * The map key, behind one button among the map controls: how each line is
 * drawn and what that means. Two of the lines can be hidden, each with its
 * eye; the eyes belong to the map and do not filter the list. How a status
 * is drawn is chosen in Settings, which the link at the bottom opens.
 */
export function MapKey() {
  const { network } = useStudioData()
  const layers = useStudio((s) => s.layers)
  const toggleLayer = useStudio((s) => s.toggleLayer)
  const lineStyle = useSettings((s) => s.lineStyle)
  const openSettings = useSettingsOpen((s) => s.setOpen)
  const [open, setOpen] = useState(false)
  const waiting = network.proposedPaths.length

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
        <PopoverContent side="left" align="start" className="w-72 gap-2 p-2">
          <PopoverTitle className="px-2 pt-1 type-ui-xs-medium text-muted-foreground">
            Map key
          </PopoverTitle>
          <ul className="flex flex-col gap-0.5">
            <LayerRow
              name={styleName("solid")}
              meta={legendText(lineStyle, "solid")}
              lineKey={<LineKey kind="solid" />}
            />
            <LayerRow
              name={styleName("dotted")}
              meta={legendText(lineStyle, "dotted")}
              lineKey={<LineKey kind="dotted" />}
            />
            <LayerRow
              name="Dashed"
              label="proposed paths"
              meta={`Proposed by a tool · ${formatCount(waiting)} waiting`}
              lineKey={<LineKey kind="dashed" />}
              visible={layers.proposed}
              onVisibleChange={() => toggleLayer("proposed")}
            />
            <LayerRow
              name="Faint"
              label="sections hidden by the filters"
              meta="Hidden by the filters"
              lineKey={<LineKey kind="ghost" />}
              visible={layers.faint}
              onVisibleChange={() => toggleLayer("faint")}
            />
            <LayerRow
              name="Blue"
              meta="Selected"
              lineKey={<LineKey kind="selected" />}
            />
          </ul>
          <div className="border-t px-2 pt-2 pb-1">
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0"
              onClick={() => {
                setOpen(false)
                openSettings(true)
              }}
            >
              Change how lines are drawn
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </MapControl>
  )
}
