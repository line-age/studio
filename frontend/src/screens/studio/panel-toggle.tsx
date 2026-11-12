import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"

import { useLeftPanel } from "./left-panel-context"
import { useStudio } from "./studio-store"

/*
 * The button at the top right of a side panel's header that shuts the panel.
 * Once shut, the same icon appears in the top bar to open it again.
 */

export function LeftPanelToggle() {
  const { toggleOpen } = useLeftPanel()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Hide the left panel"
      className="text-muted-foreground"
      onClick={toggleOpen}
    >
      <Icon name="panel-left" />
    </Button>
  )
}

export function PropertiesToggle() {
  const toggle = useStudio((s) => s.toggleProperties)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Hide the properties panel"
      className="text-muted-foreground"
      onClick={toggle}
    >
      <Icon name="panel-right" />
    </Button>
  )
}
