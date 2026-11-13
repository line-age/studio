import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * The edition in force: the year the network is shown as of. The list and the
 * map both follow it. An edition is a lens, not a container of sections, and
 * not a filter: its label says "Map edition" so it does not read as one.
 */
export function EditionSelect() {
  const { network, edition } = useStudioData()
  const setEdition = useStudio((s) => s.setEdition)
  const items = [...network.editions]
    .sort((a, b) => a.year - b.year)
    .map((e) => ({ value: e.id, label: e.label }))

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className="shrink-0 rounded-sm type-ui-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          Map edition
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          Shows the network as this edition&apos;s map draws it. Not a filter.
        </TooltipContent>
      </Tooltip>
      <Select
        items={items}
        value={edition.id}
        onValueChange={(id) => {
          if (id) setEdition(id)
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Edition the network is shown as of"
          className="min-w-0 flex-1"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
