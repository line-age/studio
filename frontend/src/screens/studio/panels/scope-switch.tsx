import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SCOPE, SCOPES, type Scope } from "@/data/derive"

import { useStudio } from "../studio-store"

/**
 * The switch above the list: All, Pipelines or Unplaced (Figma section 18,
 * `403:14743`). One is always on. It sets the rows of the list, the lines on
 * the map and the filters offered; it never changes the selection.
 */
export function ScopeSwitch() {
  const scope = useStudio((s) => s.scope)
  const setScope = useStudio((s) => s.setScope)
  return (
    <Tabs value={scope} onValueChange={(next) => setScope(next as Scope)}>
      <TabsList aria-label="Show" className="w-full">
        {SCOPES.map((value) => (
          <TabsTrigger key={value} value={value}>
            {SCOPE[value].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
