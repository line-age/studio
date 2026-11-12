import { useId, useMemo } from "react"

import { GroupLabel } from "@/components/group-label"
import { LayerRow } from "@/components/layer-row"
import { LegendItem } from "@/components/legend-item"
import { LineKey } from "@/components/line-key"
import { PanelFooter } from "@/components/panel-footer"
import { PanelHeader } from "@/components/panel-header"
import { SwitchRow } from "@/components/switch-row"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCount, plural, showCounts, type ShowFilter } from "@/data/derive"
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
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b p-3">
      <GroupLabel id={id}>{title}</GroupLabel>
      {children}
    </section>
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
  const setEdition = useStudio((s) => s.setEdition)
  const clearFilters = useStudio((s) => s.clearFilters)

  const counts = useMemo(() => showCounts(summaries), [summaries])
  const editions = useMemo(
    () =>
      [...network.editions]
        .sort((a, b) => b.year - a.year)
        .map((e) => ({ value: e.id, label: e.label })),
    [network.editions]
  )
  const otherYears = network.editions
    .filter((e) => e.id !== edition.id)
    .map((e) => e.year)
    .sort()
  const proposed = network.proposedPaths.filter((p) =>
    p.editionIds.includes(edition.id)
  ).length
  const filtered = show !== "all" || !onlyInView

  return (
    <>
      <PanelHeader title="Filters" divider>
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear filters
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
              meta={plural(network.notes.length, "note")}
              visible={layers.pins}
              onVisibleChange={() => toggleLayer("pins")}
            />
            {/* Shown as designed. There is no scan layer yet, so it stays off. */}
            <LayerRow name="Scanned map" meta="Off" visible={false} />
          </ul>
        </Group>

        <Group title="Edition">
          <Select
            items={editions}
            value={edition.id}
            onValueChange={(value) => {
              if (value) setEdition(value)
            }}
          >
            <SelectTrigger className="w-full" aria-label="Edition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {editions.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Group>

        <Group title="Show">
          <RadioGroup
            aria-label="Show"
            value={show}
            onValueChange={(value) => setShow(value as ShowFilter)}
            className="gap-0.5"
          >
            {showOptions.map((option) => (
              <label
                key={option.value}
                className="flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-100 hover:bg-muted"
              >
                <RadioGroupItem value={option.value} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    show === option.value ? "type-ui-sm-medium" : "type-ui-sm"
                  )}
                >
                  {option.label}
                </span>
                <span className="type-ui-mono-xs text-muted-foreground">
                  {formatCount(counts[option.value])}
                </span>
              </label>
            ))}
          </RadioGroup>
        </Group>

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
