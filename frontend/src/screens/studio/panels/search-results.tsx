import { Fragment } from "react"

import { Hint } from "@/components/hint"
import { ListGroupHeader } from "@/components/list-group-header"
import { SearchResult, SearchResultMatch } from "@/components/search-result"
import { inView, plural, type SearchHit, type SearchMatch } from "@/data/derive"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

function MatchLine({ match }: { match: SearchMatch }) {
  switch (match.kind) {
    case "pipeline":
      return <SearchResultMatch label={plural(match.sections, "section")} />
    case "section":
      return (
        <SearchResultMatch
          label="Section"
          text={match.name}
          detail={match.code}
        />
      )
    case "sections":
      return (
        <SearchResultMatch
          label="Matched"
          text={plural(match.count, "section")}
        />
      )
    case "claim":
      return (
        <SearchResultMatch
          label={match.attribute}
          text={match.value}
          detail={plural(match.sections, "section")}
        />
      )
  }
}

export function SearchResults({
  hits,
  activeIndex,
  onOpen,
  query,
}: {
  hits: SearchHit[]
  activeIndex: number
  onOpen: (hit: SearchHit) => void
  query: string
}) {
  const { edition } = useStudioData()
  const view = useStudio((s) => s.view)

  const inside = hits.filter((hit) => inView(hit.summary, view))
  const outside = hits.filter((hit) => !inView(hit.summary, view))
  const groups = [
    { id: "in-view", title: "In the map view", hits: inside },
    { id: "outside-view", title: "Outside the map view", hits: outside },
  ].filter((group) => group.hits.length > 0)

  return (
    <>
      <div
        id="pipeline-search-results"
        role="listbox"
        aria-label="Search results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {groups.map((group) => (
          <Fragment key={group.id}>
            <ListGroupHeader id={group.id} count={group.hits.length}>
              {group.title}
            </ListGroupHeader>
            <div role="group" aria-labelledby={group.id}>
              {group.hits.map((hit) => (
                <SearchResult
                  key={hit.summary.id}
                  id={`search-hit-${hit.summary.id}`}
                  role="option"
                  aria-selected={hits[activeIndex] === hit}
                  active={hits[activeIndex] === hit}
                  name={hit.summary.name}
                  code={hit.summary.code}
                  onClick={() => onOpen(hit)}
                >
                  {hit.matches.map((match, i) => (
                    <MatchLine key={i} match={match} />
                  ))}
                </SearchResult>
              ))}
            </div>
          </Fragment>
        ))}
        {hits.length === 0 && (
          <Hint className="p-3" role="status">
            Nothing in the {edition.label} matches “{query.trim()}”.
          </Hint>
        )}
      </div>
      {hits.length > 0 && (
        <div className="shrink-0 border-t px-3 py-2.5">
          <Hint>
            Enter opens the first result and moves the map to it. Esc clears the
            search.
          </Hint>
        </div>
      )}
    </>
  )
}
