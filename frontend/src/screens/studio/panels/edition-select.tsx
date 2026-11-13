import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * The edition in force: the year the network is shown as of. The list and the
 * map both follow it. An edition is a lens, not a container of sections.
 */
export function EditionSelect() {
  const { network, edition } = useStudioData()
  const setEdition = useStudio((s) => s.setEdition)
  const items = [...network.editions]
    .sort((a, b) => a.year - b.year)
    .map((e) => ({ value: e.id, label: `As of the ${e.label}` }))

  return (
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
        className="w-full"
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
  )
}
