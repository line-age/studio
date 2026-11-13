import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GROUPING, LIST_KINDS, type ListKind } from "@/data/derive"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

const ITEMS = LIST_KINDS.map((kind) => ({
  value: kind,
  label: GROUPING[kind].by,
}))

/**
 * How the list is grouped: by edition or by pipeline. It changes what the
 * rows are, never which sections are shown: the selection, the filters, the
 * search and the map stay as they are.
 */
export function GroupBySelect() {
  const { list } = useStudioData()
  const setList = useStudio((s) => s.setList)
  return (
    <Select
      items={ITEMS}
      value={list}
      onValueChange={(kind) => {
        if (kind) setList(kind as ListKind)
      }}
    >
      <SelectTrigger aria-label="Group by" className="w-full min-w-0">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">Group by</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      {/* As wide as the select itself. */}
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="w-(--anchor-width)"
      >
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
