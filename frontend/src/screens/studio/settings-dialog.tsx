import { useId } from "react"

import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { LineKey } from "@/components/line-key"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ALWAYS_PRESENT, STATUSES, STATUS_LABEL } from "@/data/status"

import { useSettings, type LineStyle } from "./settings"

const LINE_STYLES: { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
]

/**
 * Settings: which attributes a section needs cited to have sufficient data,
 * and how the map draws each status. A change shows at once, everywhere.
 * Kept in this browser for now.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  attributes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every attribute the data has, in the order sections list them. */
  attributes: readonly string[]
}) {
  const required = useSettings((s) => s.requiredAttributes)
  const toggleRequired = useSettings((s) => s.toggleRequired)
  const lineStyle = useSettings((s) => s.lineStyle)
  const setLineStyle = useSettings((s) => s.setLineStyle)
  const rulesId = useId()
  const linesId = useId()

  // What can be asked for: what the data has and what the rule already asks,
  // so a rule can always be unticked. Then what every section has.
  const optional = [...new Set([...attributes, ...required])].filter(
    (a) => !ALWAYS_PRESENT.includes(a)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-4rem)] gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Kept in this browser for now. Someone else may see different counts
            until a project can hold its own settings.
          </DialogDescription>
        </DialogHeader>

        <section
          aria-labelledby={rulesId}
          className="flex flex-col gap-2 border-b p-4"
        >
          <GroupLabel id={rulesId}>Status rules</GroupLabel>
          <Hint>
            A section has sufficient data when every attribute ticked here is
            cited. An attribute that was looked for and not found stays Unknown.
          </Hint>
          <div
            role="group"
            aria-label="Attributes that must be cited"
            className="flex flex-col gap-0.5"
          >
            {optional.map((attribute) => (
              <label
                key={attribute}
                className="flex h-8 items-center gap-2 rounded-md px-2 type-ui-sm transition-colors duration-100 hover:bg-muted"
              >
                <Checkbox
                  checked={required.includes(attribute)}
                  onCheckedChange={() => toggleRequired(attribute)}
                />
                {attribute}
              </label>
            ))}
            {ALWAYS_PRESENT.map((attribute) => (
              <label
                key={attribute}
                className="flex h-8 items-center gap-2 rounded-md px-2 type-ui-sm text-muted-foreground"
              >
                <Checkbox checked disabled />
                <span className="flex-1">{attribute}</span>
                <span className="type-ui-xs">Every section has it</span>
              </label>
            ))}
          </div>
          <Hint>
            A section is done when it has sufficient data and is in a pipeline.
            This rule is fixed.
          </Hint>
        </section>

        <section aria-labelledby={linesId} className="flex flex-col gap-2 p-4">
          <GroupLabel id={linesId}>Map lines</GroupLabel>
          <Hint>How the map draws a section, by its status.</Hint>
          <div className="flex flex-col gap-0.5">
            {STATUSES.map((status) => (
              <div
                key={status}
                className="flex h-8 items-center gap-2.5 rounded-md px-2"
              >
                <LineKey kind={lineStyle[status]} />
                <span className="min-w-0 flex-1 truncate type-ui-sm">
                  {STATUS_LABEL[status]}
                </span>
                <RadioGroup
                  aria-label={`Line for ${STATUS_LABEL[status]}`}
                  value={lineStyle[status]}
                  onValueChange={(value) =>
                    setLineStyle(status, value as LineStyle)
                  }
                  className="flex w-auto shrink-0 gap-3"
                >
                  {LINE_STYLES.map((style) => (
                    <label
                      key={style.value}
                      className="flex items-center gap-1.5 type-ui-sm"
                    >
                      <RadioGroupItem value={style.value} />
                      {style.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
