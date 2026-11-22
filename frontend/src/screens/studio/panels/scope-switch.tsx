import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isScope, SCOPE, SCOPES } from "@/data/derive"

import { useStudio } from "../studio-store"

/**
 * The switch above the list: All, Pipelines or Unplaced (Figma section 18,
 * `403:14743`). One is always on. It sets the rows of the list, the lines on
 * the map and the filters offered; it never changes the selection.
 *
 * Built as a toggle group, so it is heard as three buttons, one pressed: it
 * changes the view in place and controls no tab panel. It looks as Figma
 * draws it (the owner, 2026-11-22: look A): a grey track, the one chosen on a
 * white pill. The others are at 70% of the text colour, not Figma's 60%: at
 * 60% they miss the 4.5:1 contrast text needs on the grey (4.33).
 */
export function ScopeSwitch() {
  const scope = useStudio((s) => s.scope)
  const setScope = useStudio((s) => s.setScope)
  return (
    <ToggleGroup
      aria-label="Show"
      value={[scope]}
      onValueChange={(next) => {
        // Pressing the one already on leaves it on: one is always chosen.
        const chosen = next[0]
        if (isScope(chosen)) setScope(chosen)
      }}
      spacing={0.5}
      className="h-8 w-full rounded-lg bg-muted p-[3px]"
    >
      {SCOPES.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="h-full flex-1 rounded-md border border-transparent px-1.5 text-foreground/70 hover:bg-transparent hover:text-foreground active:bg-transparent aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm aria-pressed:active:bg-background"
        >
          {SCOPE[value].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
