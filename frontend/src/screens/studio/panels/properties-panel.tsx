import { Fragment, useEffect, useRef, type KeyboardEvent } from "react"

import { AttributeRow } from "@/components/attribute-row"
import { Hint } from "@/components/hint"
import { ListGroupHeader } from "@/components/list-group-header"
import { ListHeader } from "@/components/list-header"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { TreeItem } from "@/components/tree-item"
import {
  citedLabel,
  datedValue,
  doneLabel,
  pipelineClaims,
  pipelineLabel,
  formatCount,
  geometryBounds,
  groupsLabel,
  plural,
  sectionLabel,
  sectionMatches,
  selectionSize,
  summaryProgress,
  unionBounds,
  type SelectionGroup,
} from "@/data/derive"
import {
  OWNER_ROW,
  PIPELINE_ROW,
  proposalCount,
  proposedEndsFor,
} from "@/data/evidence"
import { ON_PIPELINE, sectionStatus } from "@/data/status"
import type { Section } from "@/data/schema"
import { isActivate, moveRovingFocus } from "@/lib/roving"
import { cn } from "@/lib/utils"

import { STARTERS } from "@/data/question"

import { AddToAgentMenu, useSelectionAttachments } from "../add-to-agent"
import {
  claimStarters,
  pipelineRowStarters,
  sectionClaimStarters,
} from "../starters"
import { useSettings } from "../settings"
import { useCriteria, useSelectionGroups, useStudioData } from "../studio-data"
import { ClaimDetail } from "./claim-detail"
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
  const focusSection = useStudio((s) => s.focusSection)
  const toggleSelected = useStudio((s) => s.toggleSelected)
  const selectAttribute = useStudio((s) => s.selectAttribute)
  const toggleExpanded = useStudio((s) => s.toggleExpanded)
  const requestFit = useStudio((s) => s.requestFit)
  const treeRef = useRef<HTMLDivElement>(null)
  const attachments = useSelectionAttachments()
  const criteria = useCriteria()
  const rule = useSettings((s) => s.requiredAttributes)
  const { network, edition } = useStudioData()
  const setList = useStudio((s) => s.setList)
  const selectPipeline = useStudio((s) => s.selectPipeline)
  const pipelineById = new Map(network.pipelines.map((p) => [p.id, p]))
  // "On the pipeline" leads there: the Pipelines list, that pipeline whole.
  const openPipeline = (pipelineId: string) => {
    const members = network.sections.filter(
      (s) => s.pipelineId === pipelineId && s.editionIds.includes(edition.id)
    )
    setList("pipelines")
    selectPipeline(
      pipelineId,
      members.map((s) => s.id)
    )
    requestFit(unionBounds(members.map((s) => geometryBounds(s.geometry))))
  }
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
  // The header speaks for what is selected, not for the pipeline around it.
  const progress = multi
    ? undefined
    : groups[0].whole
      ? summaryProgress(single, "long")
      : single.unassigned
        ? `${plural(groups[0].sections.length, "section")} selected`
        : doneLabel(
            groups[0].sections.filter((x) => sectionStatus(x, rule) === "done")
              .length,
            groups[0].sections.length,
            "long"
          )
  const check = (section: Section) => toggleSelected([section.id])

  // Reading is not selecting: a click opens the section (or closes the one
  // being read) and marks it on the map. Only the boxes change the selection.
  const pick = (section: Section) => {
    if (section.id === selectedSectionId && expanded.has(section.id)) {
      toggleExpanded(section.id)
      return
    }
    focusSection(section.id)
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
        // An unnamed pipeline goes by its code: do not say it twice.
        meta={
          multi || single.name === single.code
            ? undefined
            : (single.code ?? undefined)
        }
        divider
      >
        {progress && (
          <span className="shrink-0 type-ui-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {progress}
          </span>
        )}
      </PanelHeader>
      {/* One pipeline: what is claimed about it as a whole, apart from its
          sections. Name, owner and operator are never a section's own. */}
      {!multi && single.pipeline && (
        <div
          role="group"
          aria-label={`Claims about ${single.name}`}
          className="flex shrink-0 flex-col border-b"
        >
          <ListHeader
            label="Claims about the pipeline"
            selection={null}
            trailing={
              single.kind === "proposed"
                ? "Proposed, not confirmed"
                : plural(
                    single.pipeline.claims.filter((c) => c.value !== null)
                      .length,
                    "claim"
                  )
            }
          />
          {pipelineClaims(single.pipeline).map((claim, index, all) => {
            const owner = single.pipeline!
            // Which claim of its attribute: an owner that changed is two.
            const nth = all
              .slice(0, index)
              .filter((c) => c.attribute === claim.attribute).length
            return (
              <AddToAgentMenu
                key={`${claim.attribute}:${index}`}
                refs={[
                  {
                    kind: "claim",
                    owner: "pipeline",
                    ownerId: owner.id,
                    attribute: claim.attribute,
                    index: nth,
                  },
                ]}
                starters={claimStarters(claim)}
              >
                <AttributeRow
                  className="pl-3"
                  label={claim.attribute}
                  value={datedValue(claim)}
                  sources={claim.citations.length}
                  proposals={claim.proposals.length}
                />
              </AddToAgentMenu>
            )
          })}
        </div>
      )}
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
                count={`${formatCount(group.sections.length)} of ${formatCount(group.summary.sections.length)} selected`}
              >
                {group.summary.name}
              </ListGroupHeader>
            )}
            {group.summary.sections.map((section) => {
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
                    starters={[{ words: STARTERS.say }]}
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
                      trailing={citedLabel(section, rule)}
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
                      {(() => {
                        const pipeline = section.pipelineId
                          ? pipelineById.get(section.pipelineId)
                          : undefined
                        const proposed = section.proposedMemberships
                        const first = proposed[0]
                          ? pipelineById.get(proposed[0].pipelineId)
                          : undefined
                        const chosen =
                          selected && selectedAttribute === PIPELINE_ROW
                        const choose = () =>
                          selectAttribute(section.id, PIPELINE_ROW, true)
                        return (
                          <>
                            <AddToAgentMenu
                              items={[
                                {
                                  pipelineId: group.summary.id,
                                  sectionIds: [section.id],
                                },
                              ]}
                              starters={pipelineRowStarters(section)}
                            >
                              <AttributeRow
                                role="treeitem"
                                aria-level={2}
                                aria-selected={chosen}
                                data-roving
                                tabIndex={-1}
                                label={PIPELINE_ROW}
                                value={
                                  pipeline
                                    ? pipelineLabel(pipeline)
                                    : first
                                      ? `Not yet ${pipelineLabel(first)}'s`
                                      : null
                                }
                                proposals={pipeline ? 0 : proposed.length}
                                selected={chosen}
                                onClick={choose}
                                onKeyDown={(event) => {
                                  if (isActivate(event)) {
                                    event.preventDefault()
                                    choose()
                                  }
                                }}
                              />
                            </AddToAgentMenu>
                            {pipeline && (
                              <AttributeRow
                                role="treeitem"
                                aria-level={2}
                                aria-selected={false}
                                data-roving
                                tabIndex={-1}
                                label={OWNER_ROW}
                                value="On the pipeline"
                                onClick={() => openPipeline(pipeline.id)}
                                onKeyDown={(event) => {
                                  if (isActivate(event)) {
                                    event.preventDefault()
                                    openPipeline(pipeline.id)
                                  }
                                }}
                              />
                            )}
                          </>
                        )
                      })()}
                      {section.claims
                        // Never a section's own: they are on the pipeline.
                        .filter((c) => !ON_PIPELINE.includes(c.attribute))
                        .map((claim) => {
                          const chosen =
                            selected && claim.attribute === selectedAttribute
                          const choose = () => {
                            selectAttribute(section.id, claim.attribute, true)
                            // A proposed end or cut is drawn on the map: bring
                            // the section and the line traced as gone into view.
                            const ends = proposedEndsFor(
                              section,
                              claim.attribute
                            )
                            const both = unionBounds([
                              geometryBounds(section.geometry),
                              ...ends.map((end) =>
                                geometryBounds(end.geometry)
                              ),
                            ])
                            if (ends.length > 0 && both) requestFit(both)
                          }
                          return (
                            <AddToAgentMenu
                              key={claim.attribute}
                              refs={[
                                {
                                  kind: "claim",
                                  owner: "section",
                                  ownerId: section.id,
                                  attribute: claim.attribute,
                                },
                              ]}
                              starters={sectionClaimStarters(section, claim)}
                            >
                              <AttributeRow
                                role="treeitem"
                                aria-level={2}
                                aria-selected={chosen}
                                data-roving
                                tabIndex={-1}
                                label={claim.attribute}
                                value={claim.value}
                                sources={claim.citations.length}
                                proposals={proposalCount(section, claim)}
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
                            </AddToAgentMenu>
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
      <ClaimDetail />
      <PanelFooter>
        <span className="truncate">{selectionSize(groups)}</span>
      </PanelFooter>
    </>
  )
}
