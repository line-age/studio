import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const PAGE = 12

/**
 * Picks one year from a grid of twelve, like a date picker that stops at the
 * year. Years outside `min` to `max` cannot be picked. Built on shadcn
 * Popover and Button; not in Figma yet (the owner asked for it, 2026-11-12).
 */
export function YearPicker({
  label,
  value,
  onChange,
  min,
  max,
  first = min,
  placeholder,
  className,
}: {
  /** Accessible name, such as "Built from year". */
  label: string
  value: number | null
  onChange: (year: number | null) => void
  min: number
  max: number
  /** Where the pages of twelve start counting; keep it the same for a pair. */
  first?: number
  /** Shown when no year is picked. */
  placeholder: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // The first year of the page of twelve on show.
  const [start, setStart] = useState(() => pageOf(value ?? min, first))
  const years = Array.from({ length: PAGE }, (_, i) => start + i)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setStart(pageOf(value ?? min, first))
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-label={value === null ? label : `${label}: ${value}`}
            className={cn(
              "min-w-0 flex-1 shrink justify-between bg-background px-2.5 font-normal tabular-nums",
              value === null && "text-muted-foreground",
              className
            )}
          />
        }
      >
        {value ?? placeholder}
        <Icon name="chevron-down" className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Earlier years"
            disabled={start <= min}
            onClick={() => setStart(start - PAGE)}
          >
            <Icon name="chevron-right" className="rotate-180" />
          </Button>
          <span className="type-ui-sm-medium tabular-nums" aria-live="polite">
            {start} to {start + PAGE - 1}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Later years"
            disabled={start + PAGE > max}
            onClick={() => setStart(start + PAGE)}
          >
            <Icon name="chevron-right" />
          </Button>
        </div>
        <div role="group" aria-label={label} className="grid grid-cols-4 gap-1">
          {years.map((year) => (
            <Button
              key={year}
              variant={year === value ? "default" : "ghost"}
              size="sm"
              aria-pressed={year === value}
              disabled={year < min || year > max}
              onClick={() => {
                onChange(year)
                setOpen(false)
              }}
              className="tabular-nums"
            >
              {year}
            </Button>
          ))}
        </div>
        {value !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            Clear the year
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The first year of the page of twelve that holds `year`, counted from `first`. */
function pageOf(year: number, first: number): number {
  return first + Math.floor((year - first) / PAGE) * PAGE
}
