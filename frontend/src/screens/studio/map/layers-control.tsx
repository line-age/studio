import { Icon } from "@/components/icons/icon"
import { LayerRow } from "@/components/layer-row"
import { LegendItem } from "@/components/legend-item"
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

import { useSettings } from "../settings"
import { useStudioData, useVisiblePipelines } from "../studio-data"
import { useStudio } from "../studio-store"
import { legendText } from "./line-style"

/**
 * What the map draws, behind one button among the map controls: a switch per
 * layer, and the key to how sections are drawn. These belong to the map; they
 * do not filter the list.
 */
export function LayersControl() {
  const { network, edition } = useStudioData()
  const visible = useVisiblePipelines()
  const layers = useStudio((s) => s.layers)
  const toggleLayer = useStudio((s) => s.toggleLayer)
  const lineStyle = useSettings((s) => s.lineStyle)

  const sections = visible.reduce((n, s) => n + s.sections.length, 0)
  const otherYears = network.editions
    .filter((e) => e.id !== edition.id)
    .map((e) => e.year)
    .sort()
  const proposed = network.proposedPaths.filter((p) =>
    p.editionIds.includes(edition.id)
  ).length

  return (
    <MapControl>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Map layers">
              <Icon name="layers" />
            </Button>
          }
        />
        <PopoverContent side="left" align="start" className="w-72 gap-2 p-2">
          <PopoverTitle className="px-2 pt-1 type-ui-xs-medium text-muted-foreground">
            Show on the map
          </PopoverTitle>
          <ul className="flex flex-col gap-0.5">
            <LayerRow
              name="Sections"
              meta={`${edition.year} · ${formatCount(sections)} shown`}
              lineKey={<LineKey kind="solid" />}
              visible={layers.pipelines}
              onVisibleChange={() => toggleLayer("pipelines")}
            />
            <LayerRow
              name="Proposed paths"
              meta={`${formatCount(proposed)} waiting`}
              lineKey={<LineKey kind="dashed" />}
              visible={layers.proposed}
              onVisibleChange={() => toggleLayer("proposed")}
            />
            <LayerRow
              name="Other editions"
              meta={
                otherYears.length > 0
                  ? `${otherYears.join(", ")} as ghost`
                  : "No other edition"
              }
              lineKey={<LineKey kind="ghost" />}
              visible={layers.ghost}
              onVisibleChange={() => toggleLayer("ghost")}
            />
          </ul>
          <ul
            aria-label="How sections are drawn"
            className="flex flex-col gap-2 border-t px-2 pt-3 pb-1"
          >
            <LegendItem kind="solid">
              {legendText(lineStyle, "solid")}
            </LegendItem>
            <LegendItem kind="dotted">
              {legendText(lineStyle, "dotted")}
            </LegendItem>
          </ul>
        </PopoverContent>
      </Popover>
    </MapControl>
  )
}
