import { useState } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** "2026-11-12" as a local date, and back. Days only: no time, no zone. */
const toDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}
const toIso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** How a range reads in words; null when neither end is set. */
export function formatDateRange(
  from: string | null,
  to: string | null
): string | null {
  if (from && to) {
    return from === to
      ? dayFormat.format(toDate(from))
      : `${dayFormat.format(toDate(from))} to ${dayFormat.format(toDate(to))}`
  }
  if (from) return `From ${dayFormat.format(toDate(from))}`
  if (to) return `Until ${dayFormat.format(toDate(to))}`
  return null
}

/**
 * A from-to range of days: two fields, From and To, that open one calendar.
 * Built on shadcn Popover
 * and Calendar; not in Figma yet (the owner asked for it, 2026-11-12).
 */
export function DateRangePicker({
  label,
  from,
  to,
  onChange,
  min,
  max,
  className,
}: {
  /** Accessible name, such as "Added to Lineage". */
  label: string
  /** ISO days, "2026-11-12". */
  from: string | null
  to: string | null
  onChange: (from: string | null, to: string | null) => void
  /** The first and last day that can be picked. */
  min?: string
  max?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const text = formatDateRange(from, to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* One control drawn as two fields, so it reads as from and to. */}
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={text ? `${label}: ${text}` : label}
            className={cn(
              "group/range flex w-full items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring",
              className
            )}
          />
        }
      >
        <RangeEnd value={from} placeholder="From" />
        <span className="type-ui-sm text-muted-foreground">to</span>
        <RangeEnd value={to} placeholder="To" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <Calendar
          mode="range"
          weekStartsOn={1}
          defaultMonth={toDate(from ?? to ?? max ?? toIso(new Date()))}
          selected={{
            from: from ? toDate(from) : undefined,
            to: to ? toDate(to) : undefined,
          }}
          onSelect={(range) =>
            onChange(
              range?.from ? toIso(range.from) : null,
              range?.to ? toIso(range.to) : null
            )
          }
          disabled={[
            ...(min ? [{ before: toDate(min) }] : []),
            ...(max ? [{ after: toDate(max) }] : []),
          ]}
        />
        {text && (
          <Button
            variant="ghost"
            size="sm"
            className="mx-1 mb-1"
            onClick={() => {
              onChange(null, null)
              setOpen(false)
            }}
          >
            Clear the dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** One end of the range, drawn like an outline button. */
function RangeEnd({
  value,
  placeholder,
}: {
  value: string | null
  placeholder: string
}) {
  return (
    <span
      className={cn(
        "flex h-control min-w-0 flex-1 items-center justify-between gap-1 rounded-lg border border-border bg-background px-2.5 type-ui-sm tabular-nums transition-colors group-hover/range:bg-muted group-aria-expanded/range:bg-muted",
        value === null && "text-muted-foreground"
      )}
    >
      <span className="truncate">
        {value === null ? placeholder : dayFormat.format(toDate(value))}
      </span>
      <Icon
        name="chevron-down"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    </span>
  )
}
