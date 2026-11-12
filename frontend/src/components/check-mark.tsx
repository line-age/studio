import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * The look of a Checkbox without the control. Rows that are selected as a
 * whole (a pipeline, a section) show it as a tick; the row is what the person
 * operates, so this is hidden from assistive technology.
 */
export function CheckMark({
  value,
  className,
}: {
  value: "unchecked" | "checked" | "indeterminate"
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-primary-foreground transition-colors duration-100",
        value !== "unchecked" && "border-primary bg-primary",
        className
      )}
    >
      {value === "checked" && <Icon name="check" className="size-3" />}
      {value === "indeterminate" && <Icon name="minus" className="size-3" />}
    </span>
  )
}
