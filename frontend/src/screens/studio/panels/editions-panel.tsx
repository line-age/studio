import { useMemo } from "react"

import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { Button } from "@/components/ui/button"
import {
  editionProgress,
  firstEdition,
  formatCount,
  geometryBounds,
  plural,
  unionBounds,
  type EditionProgress,
} from "@/data/derive"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { useLeftPanel } from "../left-panel-context"
import { LeftPanelToggle } from "../panel-toggle"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/*
 * The Editions panel: every map edition, oldest first, with the sections it
 * is the first to show and how many of those are placed in a pipeline.
 * Choosing one puts it in force, so the map and the list show the network as
 * it stood then. Not in Figma yet (the owner asked for it on 2026-11-13).
 */
export function EditionsPanel() {
  const { network, edition: inForce } = useStudioData()
  const setEdition = useStudio((s) => s.setEdition)
  const select = useStudio((s) => s.select)
  const requestFit = useStudio((s) => s.requestFit)
  const { openPanel } = useLeftPanel()

  const rows = useMemo(() => editionProgress(network), [network])
  const sections = rows.reduce((n, row) => n + row.sections, 0)
  const placed = rows.reduce((n, row) => n + row.placed, 0)

  // Straight to the edition's own sections: selected, and in the list.
  const openSections = (row: EditionProgress) => {
    const own = network.sections.filter(
      (section) => firstEdition(network, section)?.id === row.edition.id
    )
    setEdition(row.edition.id)
    select(own.map((section) => section.id))
    requestFit(unionBounds(own.map((s) => geometryBounds(s.geometry))), true)
    openPanel("pipelines")
  }

  return (
    <>
      <PanelHeader title="Editions" meta={formatCount(rows.length)} divider>
        <LeftPanelToggle />
      </PanelHeader>
      <Hint className="shrink-0 border-b px-3 py-2">
        Choose an edition to see the network as that map shows it. A section
        belongs to the first edition it is seen on.
      </Hint>
      <div
        role="listbox"
        aria-label="Editions"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {rows.map((row) => {
          const chosen = row.edition.id === inForce.id
          const share = row.sections === 0 ? 0 : row.placed / row.sections
          return (
            <div
              key={row.edition.id}
              role="option"
              aria-selected={chosen}
              data-roving
              data-selected={chosen || undefined}
              tabIndex={chosen ? 0 : -1}
              onClick={() => setEdition(row.edition.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (isActivate(event)) {
                  event.preventDefault()
                  setEdition(row.edition.id)
                }
              }}
              className={cn(
                "flex cursor-default flex-col gap-1.5 border-b border-border-subtle px-3 py-2.5 transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
                chosen
                  ? "bg-selected hover:bg-selected-hover"
                  : "hover:bg-muted active:bg-accent"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate type-ui-sm-medium">
                    {row.edition.label}
                  </span>
                  <span className="truncate type-ui-xs text-muted-foreground">
                    {plural(row.sections, "section")} first seen
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={row.sections === 0}
                  aria-label={`Open the sections of the ${row.edition.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    openSections(row)
                  }}
                >
                  Sections
                  <Icon name="chevron-right" className="size-3" />
                </Button>
              </div>
              <div
                role="progressbar"
                aria-label={`Sections of the ${row.edition.label} placed in a pipeline`}
                aria-valuemin={0}
                aria-valuemax={row.sections}
                aria-valuenow={row.placed}
                aria-valuetext={`${row.placed} of ${row.sections}`}
                className="h-1 overflow-hidden rounded-full bg-border"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <span className="type-ui-xs text-muted-foreground tabular-nums">
                {formatCount(row.placed)} of {formatCount(row.sections)} in a
                pipeline
              </span>
            </div>
          )
        })}
      </div>
      <PanelFooter>
        <span>
          {formatCount(placed)} of {plural(sections, "section")} in a pipeline
        </span>
      </PanelFooter>
    </>
  )
}
