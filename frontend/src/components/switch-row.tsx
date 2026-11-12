import { useId, type ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/** A Switch with its label and one line of description. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  className,
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("flex gap-2", className)}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-px"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} className="type-ui-sm-medium">
          {label}
        </label>
        {description && (
          <p
            id={`${id}-description`}
            className="type-ui-sm text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
