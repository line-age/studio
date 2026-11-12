import { Icon, type IconName } from "@/components/icons/icon"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export type MapTool = "select" | "lasso" | "vertices" | "draw" | "split"

const tools: { value: MapTool; icon: IconName; label: string; key: string }[] =
  [
    { value: "select", icon: "tool-select", label: "Select", key: "V" },
    { value: "lasso", icon: "tool-lasso", label: "Lasso", key: "L" },
    {
      value: "vertices",
      icon: "tool-vertex",
      label: "Move vertices",
      key: "A",
    },
    { value: "draw", icon: "tool-draw", label: "Draw a section", key: "D" },
    { value: "split", icon: "tool-split", label: "Split a section", key: "S" },
  ]

/**
 * The map tools, floating bottom centre of the map. Exactly one is active.
 * There is no delete tool.
 */
export function ToolPalette({
  value,
  onValueChange,
  className,
}: {
  value: MapTool
  onValueChange: (tool: MapTool) => void
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label="Map tools"
      value={[value]}
      onValueChange={(next) => {
        const tool = next[0] as MapTool | undefined
        if (tool) onValueChange(tool)
      }}
      spacing={0.5}
      className={cn(
        "rounded-xl border bg-background p-1 shadow-map-control",
        className
      )}
    >
      {tools.map((tool) => (
        <ToggleGroupItem
          key={tool.value}
          value={tool.value}
          aria-label={`${tool.label} (${tool.key})`}
          className="px-0"
        >
          <Icon name={tool.icon} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
