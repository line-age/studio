import { Fragment, useEffect, useRef, type KeyboardEvent } from "react"

import { AttributeRow } from "@/components/attribute-row"
import { Hint } from "@/components/hint"
import { ListGroupHeader } from "@/components/list-group-header"
import { ListHeader } from "@/components/list-header"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { StatusLabel } from "@/components/status-label"
import { TreeItem } from "@/components/tree-item"
import { Badge } from "@/components/ui/badge"
import {
  formatCount,
  geometryBounds,
  groupsLabel,
  sectionStats,
  sectionLabel,
  sectionMatches,
  selectionSize,
  sumStats,
  type SelectionGroup,
} from "@/data/derive"
import type { Section } from "@/data/schema"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import { useCriteria, useSelectionGroups } from "../studio-data"
import { useStudio } from "../studio-store"

export function PropertiesPanel() {
  const groups = useSelectionGroups()

  if (groups.length === 0) {
    return (
      <>
        <PanelHeader title="Nothing selected" divider />
        <Hint className="p-3">
          Select a row in the list, or a section on the map, to see its sections
          and which of their claims are cited.
        </Hint>
      </>
    )
  }
  return <SelectionProperties groups={groups} />
}

/**
 * The selection as a tree: every section of each pipeline touched, the
 * selected ones ticked. Several pipelines are listed one under the other.
 */
function SelectionProperties({ groups }: { groups: SelectionGroup[] }) {
  const selectedSectionId = useStudio((s) => s.selectedSectionId)
  const selectedAttribute = useStudio((s) => s.selectedAttribute)
  const expanded = useStudio((s) => s.expandedSectionIds)
  const selection = useStudio((s) => s.selection)
  const select = useStudio((s) => s.select)
  const selectSection = useStudio((s) => s.selectSection)
  const focusSection = useStudio((s) => s.focusSection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const toggleExpanded = useStudio((s) => s.toggleExpanded)
  const requestFit = useStudio((s) => s.requestFit)
  const treeRef = useRef<HTMLDivElement>(null)
  const attachments = useSelectionAttachments()
  const criteria = useCriteria()
  // Only the one-click filters dim: they are about the section itself.
  const filtering = criteria.status !== "all" || criteria.needsDecision

  // A section picked on the map can be off screen in the tree: bring it in.
  useEffect(() => {
    if (!selectedSectionId) return
    treeRef.current
      ?.querySelector(`[data-section="${CSS.escape(selectedSectionId)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [selectedSectionId])

  const multi = groups.length > 1
  const single = groups[0].summary
  const allSections = groups.flatMap((g) => g.summary.sections)
  const allIds = allSections.map((s) => s.id)
  const isChecked = (id: string) => selection.has(id)
  const checkedCount = selection.size
  const stats = multi
    ? sumStats(groups.flatMap((g) => g.sections))
    : single.stats
  const check = (section: Section) => toggleSelected([section.id])

  // With one pipeline a click narrows the selection to that section. With
  // several it only opens the section, so the selection survives reading.
  const keep = (section: Section) => multi && isChecked(section.id)
  const pick = (section: Section) => {
    if (keep(section)) focusSection(section.id)
    else selectSection(section.id)
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

  const tabStop = allSections.some((s) => s.id === selectedSectionId)
    ? selectedSectionId
    : allSections[0]?.id

  return (
    <>
      <PanelHeader
        icon="line"
        title={multi ? groupsLabel(groups.map((g) => g.summary)) : single.name}
        meta={multi ? undefined : (single.code ?? undefined)}
        divider
      >
        {stats.cited > 0 && (
          <Badge variant="cited">{formatCount(stats.cited)} cited</Badge>
        )}
        {stats.unknown > 0 && (
          <Badge variant="unknown">{formatCount(stats.unknown)} Unknown</Badge>
        )}
      </PanelHeader>
      <ListHeader
        label="Sections"
        trailing={`${formatCount(checkedCount)} of ${formatCount(allIds.length)} selected`}
        selection={checkedCount === allIds.length ? "checked" : "indeterminate"}
        selectionLabel="Select all sections"
        onSelectionChange={() =>
          select(checkedCount === allIds.length ? [] : allIds)
        }
      />
      <div
        ref={treeRef}
        role="tree"
        aria-label={
          multi ? "Sections of the selection" : `Sections of ${single.name}`
        }
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onKeyDown={moveRovingFocus}
      >
        {groups.map((group) => (
          <Fragment key={group.summary.id}>
            {multi && (
              <ListGroupHeader
                count={`${group.sections.length} of ${group.summary.sections.length}`}
              >
                {group.summary.name}
              </ListGroupHeader>
            )}
            {group.summary.sections.map((section) => {
              const stats = sectionStats(section)
              const open = expanded.has(section.id)
              const selected = section.id === selectedSectionId
              return (
                <Fragment key={section.id}>
                  {/* Right click on a ticked row offers the whole selection. */}
                  <AddToAgentMenu
                    items={
                      isChecked(section.id)
                        ? attachments
                        : [
                            {
                              pipelineId: group.summary.id,
                              sectionIds: [section.id],
                            },
                          ]
                    }
                  >
                    <TreeItem
                      role="treeitem"
                      // Kept because its pipeline has a match; not one itself.
                      className={cn(
                        filtering &&
                          !sectionMatches(section, criteria) &&
                          "opacity-50"
                      )}
                      data-dimmed={
                        (filtering && !sectionMatches(section, criteria)) ||
                        undefined
                      }
                      aria-level={1}
                      aria-expanded={open}
                      aria-selected={selected}
                      data-roving
                      data-section={section.id}
                      tabIndex={section.id === tabStop ? 0 : -1}
                      name={sectionLabel(section)}
                      code={section.name === null ? null : section.code}
                      expanded={open}
                      selected={selected}
                      checked={isChecked(section.id)}
                      onCheck={() => check(section)}
                      checkLabel={`Select ${sectionLabel(section)}`}
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
                    <div
                      role="group"
                      aria-label={`Claims of ${sectionLabel(section)}`}
                    >
                      {section.claims.map((claim) => {
                        const chosen =
                          selected && claim.attribute === selectedAttribute
                        const choose = () =>
                          selectAttribute(
                            section.id,
                            claim.attribute,
                            keep(section)
                          )
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
          </Fragment>
        ))}
      </div>
      <PanelFooter>
        <span className="truncate">{selectionSize(groups)}</span>
      </PanelFooter>
    </>
  )
}
