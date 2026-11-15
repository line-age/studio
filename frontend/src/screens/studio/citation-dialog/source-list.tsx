import { Icon, type IconName } from "@/components/icons/icon"
import { groupBySource, passagesWords } from "@/data/evidence"
import type { Citation } from "@/data/schema"

/** Which icon a source's row leads with. Figma SourceRow `331:13191`. */
function iconFor(citation: Citation): IconName {
  if (citation.sourceKind === "map_sheet") return "scan"
  return citation.url !== undefined || citation.archiveUrl !== undefined
    ? "link"
    : "source"
}

/**
 * Every source the open claim cites, once each: "N passages" when it cites
 * the source more than once. Selecting a row selects the source's first
 * citation. Single-select, like `FollowMapToggle`, not a checkbox list.
 * Figma SourceRow `331:13191`.
 */
export function SourceList({
  citations,
  selectedIndex,
  onSelect,
}: {
  citations: readonly Citation[]
  selectedIndex: number
  onSelect: (citationIndex: number) => void
}) {
  const groups = groupBySource(citations)
  return (
    <ul
      aria-label="Sources"
      data-citation-source-list
      className="flex flex-col"
    >
      {groups.map((group) => {
        const firstIndex = citations.indexOf(group.citations[0])
        const selected = group.citations.some(
          (c) => citations.indexOf(c) === selectedIndex
        )
        const passages = passagesWords(group.citations.length)
        return (
          <li key={group.key}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(firstIndex)}
              className="flex h-9 w-full items-center gap-2 border-b border-border-subtle px-3 text-left transition-colors duration-100 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid aria-pressed:bg-selected aria-pressed:text-selected-foreground"
            >
              <Icon
                name={iconFor(group.citations[0])}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate type-ui-sm">
                {group.source}
              </span>
              {passages !== undefined && (
                <span className="shrink-0 type-ui-mono-xs text-muted-foreground">
                  {passages}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
