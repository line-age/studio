import { useId, useMemo } from "react"

import { GroupLabel } from "@/components/group-label"
import { LayerRow } from "@/components/layer-row"
import { LegendItem } from "@/components/legend-item"
import { LineKey } from "@/components/line-key"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { SwitchRow } from "@/components/switch-row"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  attributeNames,
  formatCount,
  matchesUnknownIn,
  plural,
  showCounts,
  type ShowFilter,
} from "@/data/derive"
import { cn } from "@/lib/utils"

import { useStudioData, useVisiblePipelines } from "../studio-data"
import { useStudio } from "../studio-store"

const showOptions: { value: ShowFilter; label: string }[] = [
  { value: "all", label: "All pipelines" },
  { value: "unknown", label: "With Unknown facts" },
  { value: "proposals", label: "With proposals waiting" },
  { value: "changed", label: "Changed since last review" },
]

function Group({
  title,
  action,
  children,
}: {
  title: string
  /** A small control on the right of the title, such as Clear. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b p-3">
      <div className="flex items-center justify-between gap-2">
        <GroupLabel id={id}>{title}</GroupLabel>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One choice in a filter group: the control, its label, and how many match. */
function OptionRow({
  control,
  label,
  count,
  selected,
}: {
  control: React.ReactNode
  label: string
  count: number
  selected: boolean
}) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-muted">
      {control}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          selected ? "type-ui-sm-medium" : "type-ui-sm"
        )}
      >
        {label}
      </span>
      <span className="type-ui-mono-xs text-muted-foreground">
        {formatCount(count)}
      </span>
    </label>
  )
}

export function FiltersPanel() {
  const { network, edition, summaries } = useStudioData()
  const visible = useVisiblePipelines()
  const layers = useStudio((s) => s.layers)
  const toggleLayer = useStudio((s) => s.toggleLayer)
  const show = useStudio((s) => s.show)
  const setShow = useStudio((s) => s.setShow)
  const onlyInView = useStudio((s) => s.onlyInView)
  const setOnlyInView = useStudio((s) => s.setOnlyInView)
  const clearFilters = useStudio((s) => s.clearFilters)
  const unknownIn = useStudio((s) => s.unknownIn)
  const toggleUnknownIn = useStudio((s) => s.toggleUnknownIn)

  const counts = useMemo(() => showCounts(summaries), [summaries])
  // Only notes on sections of this edition are drawn, so only those count.
  const noteCount = useMemo(() => {
    const inEdition = new Set(
      summaries.flatMap((s) => s.sections.map((section) => section.id))
    )
    return network.notes.filter((note) => inEdition.has(note.sectionId)).length
  }, [network.notes, summaries])
  const otherYears = network.editions
    .filter((e) => e.id !== edition.id)
    .map((e) => e.year)
    .sort()
  const proposed = network.proposedPaths.filter((p) =>
    p.editionIds.includes(edition.id)
  ).length
  // Per attribute: how many pipelines have a section where it is Unknown.
  const attributes = useMemo(
    () =>
      attributeNames(summaries).map((name) => ({
        name,
        count: summaries.filter((s) => matchesUnknownIn(s, [name])).length,
      })),
    [summaries]
  )
  const filtered = show !== "all" || !onlyInView || unknownIn.length > 0

  return (
    <>
      <PanelHeader title="Filters" divider>
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear all
          </Button>
        )}
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Group title="Show on the map">
          <ul className="flex flex-col gap-0.5">
            <LayerRow
              name="Pipelines"
              meta={`${edition.year} · ${formatCount(visible.length)} ${onlyInView ? "in view" : "shown"}`}
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
            <LayerRow
              name="Note pins"
              meta={plural(noteCount, "note")}
              visible={layers.pins}
              onVisibleChange={() => toggleLayer("pins")}
            />
            {/* Shown as designed. There is no scan layer yet, so it stays off. */}
            <LayerRow name="Scanned map" meta="Off" visible={false} />
          </ul>
        </Group>

        <Group title="Show">
          <RadioGroup
            aria-label="Show"
            value={show}
            onValueChange={(value) => setShow(value as ShowFilter)}
            className="gap-0.5"
          >
            {showOptions.map((option) => (
              <OptionRow
                key={option.value}
                control={<RadioGroupItem value={option.value} />}
                label={option.label}
                count={counts[option.value]}
                selected={show === option.value}
              />
            ))}
          </RadioGroup>
        </Group>

        {attributes.length > 0 && (
          <Group
            title="Unknown in"
            action={
              unknownIn.length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => unknownIn.forEach(toggleUnknownIn)}
                >
                  Clear
                </Button>
              )
            }
          >
            <div
              role="group"
              aria-label="Unknown in"
              className="flex flex-col gap-0.5"
            >
              {attributes.map(({ name, count }) => (
                <OptionRow
                  key={name}
                  control={
                    <Checkbox
                      checked={unknownIn.includes(name)}
                      onCheckedChange={() => toggleUnknownIn(name)}
                    />
                  }
                  label={name}
                  count={count}
                  selected={unknownIn.includes(name)}
                />
              ))}
            </div>
            {unknownIn.length > 1 && (
              <p className="px-2 type-ui-xs text-muted-foreground">
                Pipelines where any of these is Unknown.
              </p>
            )}
          </Group>
        )}

        <Group title="Area">
          <SwitchRow
            label="Only what's in the map view"
            description="The list follows the map as you pan and zoom."
            checked={onlyInView}
            onCheckedChange={setOnlyInView}
          />
        </Group>

        <Group title="How sections are drawn">
          <ul className="flex flex-col gap-2">
            <LegendItem kind="solid">Solid: every fact is cited</LegendItem>
            <LegendItem kind="dotted">
              Dotted: at least one fact is Unknown
            </LegendItem>
          </ul>
        </Group>
      </div>

      <PanelFooter>
        <span aria-live="polite">
          {formatCount(visible.length)} of{" "}
          {plural(summaries.length, "pipeline")} shown
        </span>
      </PanelFooter>
    </>
  )
}
