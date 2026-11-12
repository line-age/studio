import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/**
 * The look of a Checkbox without the control. Rows that are selected as a
 * whole (a pipeline, a section) show it as a tick; the row is what the person
 * operates, so this is hidden from assistive technology. With `onChange` it
 * becomes a real checkbox the person can click on its own.
 */
export function CheckMark({
  value,
  className,
  label,
  onChange,
  tabIndex = -1,
}: {
  value: "unchecked" | "checked" | "indeterminate"
  className?: string
  /** Accessible name, needed when `onChange` is given. */
  label?: string
  onChange?: () => void
  /** Rows handle the keyboard themselves, so the box is skipped by Tab unless told. */
  tabIndex?: number
}) {
  const classes = cn(
    "flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-primary-foreground transition-colors duration-100",
    value !== "unchecked" && "border-primary bg-primary",
    className
  )
  const mark = (
    <>
      {value === "checked" && <Icon name="check" className="size-3" />}
      {value === "indeterminate" && <Icon name="minus" className="size-3" />}
    </>
  )
  if (!onChange) {
    return (
      <span aria-hidden="true" className={classes}>
        {mark}
      </span>
    )
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={value === "indeterminate" ? "mixed" : value === "checked"}
      aria-label={label}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation()
        onChange()
      }}
      className={cn(
        classes,
        "relative cursor-default after:absolute after:-inset-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
      )}
    >
      {mark}
    </button>
  )
}
