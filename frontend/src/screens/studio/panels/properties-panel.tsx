import { Fragment, useEffect, useRef, type KeyboardEvent } from "react"

import { AttributeRow } from "@/components/attribute-row"
import { Hint } from "@/components/hint"
import { ListHeader } from "@/components/list-header"
import { PanelHeader } from "@/components/panel-header"
import { StatusLabel } from "@/components/status-label"
import { TreeItem } from "@/components/tree-item"
import { Badge } from "@/components/ui/badge"
import {
  formatCount,
  geometryBounds,
  sectionStats,
  type PipelineSummary,
} from "@/data/derive"
import type { Section } from "@/data/schema"
import { isActivate, moveRovingFocus } from "@/lib/roving"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { PropertiesToggle } from "../panel-toggle"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

export function PropertiesPanel() {
  const { summaryById } = useStudioData()
  const selectedId = useStudio((s) => s.selectedPipelineId)
  const summary = selectedId ? summaryById.get(selectedId) : undefined

  if (!summary) {
    return (
      <>
        <PanelHeader title="Nothing selected" divider />
        <Hint className="p-3">
          Select a pipeline in the list, or a section on the map, to see its
          sections and which of their facts are cited.
        </Hint>
      </>
    )
  }
  return <PipelineProperties summary={summary} />
}

function PipelineProperties({ summary }: { summary: PipelineSummary }) {
  const selectedSectionId = useStudio((s) => s.selectedSectionId)
  const selectedAttribute = useStudio((s) => s.selectedAttribute)
  const expanded = useStudio((s) => s.expandedSectionIds)
  const checkedIds = useStudio((s) => s.checkedSectionIds)
  const selectSection = useStudio((s) => s.selectSection)
  const toggleSection = useStudio((s) => s.toggleSection)
  const toggleAllSections = useStudio((s) => s.toggleAllSections)
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const toggleExpanded = useStudio((s) => s.toggleExpanded)
  const requestFit = useStudio((s) => s.requestFit)
  const treeRef = useRef<HTMLDivElement>(null)
  const selection = useSelectionAttachments()

  // A section picked on the map can be off screen in the tree: bring it in.
  useEffect(() => {
    if (!selectedSectionId) return
    treeRef.current
      ?.querySelector(`[data-section="${CSS.escape(selectedSectionId)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selectedSectionId])

  // Selecting a pipeline selects all of its sections (checkedIds is null).
  const sectionIds = summary.sections.map((s) => s.id)
  const isChecked = (id: string) => checkedIds === null || checkedIds.has(id)
  const checkedCount = sectionIds.filter(isChecked).length
  const check = (section: Section) => toggleSection(section.id, sectionIds)

  const pick = (section: Section) => {
    selectSection(summary.id, section.id)
    requestFit(geometryBounds(section.geometry))
  }

  const onSectionKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    section: Section
  ) => {
    const open = expanded.has(section.id)
    if (event.target !== event.currentTarget) return
    if (event.key === " ") {
      event.preventDefault()
      check(section)
    } else if (event.key === "Enter") {
      event.preventDefault()
      pick(section)
    } else if (event.key === "ArrowRight" && !open) {
      event.preventDefault()
      toggleExpanded(section.id)
    } else if (event.key === "ArrowLeft" && open) {
      event.preventDefault()
      toggleExpanded(section.id)
    }
  }

  const tabStop = summary.sections.some((s) => s.id === selectedSectionId)
    ? selectedSectionId
    : summary.sections[0]?.id

  return (
    <>
      <PanelHeader
        icon="line"
        title={summary.name}
        meta={summary.code ?? undefined}
        divider
      >
        {summary.stats.cited > 0 && (
          <Badge variant="cited">
            {formatCount(summary.stats.cited)} cited
          </Badge>
        )}
        {summary.stats.unknown > 0 && (
          <Badge variant="unknown">
            {formatCount(summary.stats.unknown)} Unknown
          </Badge>
        )}
        <PropertiesToggle />
      </PanelHeader>
      <ListHeader
        label="Sections"
        trailing={`${formatCount(checkedCount)} of ${formatCount(sectionIds.length)} selected`}
        selection={
          checkedCount === 0
            ? "unchecked"
            : checkedCount === sectionIds.length
              ? "checked"
              : "indeterminate"
        }
        selectionLabel="Select all sections"
        onSelectionChange={toggleAllSections}
      />
      <div
        ref={treeRef}
        role="tree"
        aria-label={`Sections of ${summary.name}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {summary.sections.map((section) => {
          const stats = sectionStats(section)
          const open = expanded.has(section.id)
          const selected = section.id === selectedSectionId
          return (
            <Fragment key={section.id}>
              {/* Right click on a ticked row offers the whole selection. */}
              <AddToAgentMenu
                items={
                  isChecked(section.id)
                    ? selection
                    : [{ kind: "section", id: section.id }]
                }
              >
                <TreeItem
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={open}
                  aria-selected={selected}
                  data-roving
                  data-section={section.id}
                  tabIndex={section.id === tabStop ? 0 : -1}
                  name={section.name}
                  code={section.code}
                  expanded={open}
                  selected={selected}
                  checked={isChecked(section.id)}
                  onCheck={() => check(section)}
                  checkLabel={`Select ${section.name}`}
                  trailing={
                    stats.unknown > 0 ? (
                      <StatusLabel status="unknown">
                        {formatCount(stats.unknown)} Unknown
                      </StatusLabel>
                    ) : (
                      `${stats.cited} of ${stats.total}`
                    )
                  }
                  onToggle={() => toggleExpanded(section.id)}
                  onClick={() => pick(section)}
                  onKeyDown={(event) => onSectionKeyDown(event, section)}
                />
              </AddToAgentMenu>
              {open && (
                <div role="group" aria-label={`Facts of ${section.name}`}>
                  {section.claims.map((claim) => {
                    const chosen =
                      selected && claim.attribute === selectedAttribute
                    const choose = () =>
                      selectAttribute(summary.id, section.id, claim.attribute)
                    return (
                      <AttributeRow
                        key={claim.attribute}
                        role="treeitem"
                        aria-level={2}
                        aria-selected={chosen}
                        data-roving
                        tabIndex={-1}
                        label={claim.attribute}
                        value={claim.value}
                        sources={claim.citations.length}
                        proposals={claim.proposals.length}
                        selected={chosen}
                        onClick={choose}
                        onKeyDown={(event) => {
                          if (isActivate(event)) {
                            event.preventDefault()
                            choose()
                          } else if (event.key === "ArrowLeft") {
                            event.preventDefault()
                            treeRef.current
                              ?.querySelector<HTMLElement>(
                                `[data-section="${CSS.escape(section.id)}"]`
                              )
                              ?.focus()
                          }
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </>
  )
}
