import { useMemo, useState } from "react"

import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  findEmbeddedDate,
  MONTHS,
  words,
  type DateParts,
} from "@/data/evidence"
import { cn } from "@/lib/utils"

/*
 * A date field for First seen, Last seen and Build date: a trigger that
 * reads like the other fields, opening a calendar. Old map dates are often
 * known only to the year or month, so a person picks which to the Day,
 * Month or Year precision before picking the date itself. Not in Figma yet
 * (the owner asked for date pickers, 2026-11-15; see the brief).
 */

type Precision = "day" | "month" | "year"

/** Historical gas-line maps go back to the 1800s; nothing here is future. */
const MIN_YEAR = 1850
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from(
  { length: THIS_YEAR - MIN_YEAR + 1 },
  (_, i) => MIN_YEAR + i
)

function precisionOf(date: DateParts): Precision {
  if (date.day !== undefined) return "day"
  if (date.month !== undefined) return "month"
  return "year"
}

function toJsDate(date: DateParts): Date {
  return new Date(date.year, (date.month ?? 1) - 1, date.day ?? 1)
}

function fromJsDate(date: Date): DateParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  }
}

export function DateField({
  id,
  value,
  isMixed,
  disabled,
  autoFocus,
  error,
  onChange,
}: {
  id: string
  /** The claim's current text; may not be a date Studio can read at all. */
  value: string
  isMixed: boolean
  disabled?: boolean
  autoFocus?: boolean
  error?: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Read once: the value as the form opened, so a later clean edit does not
  // erase what the source actually said (shown below as a hint).
  const [original] = useState(value)
  const originalParsed = useMemo(() => findEmbeddedDate(original), [original])
  const parsed = useMemo(() => findEmbeddedDate(value), [value])
  const [precision, setPrecision] = useState<Precision>(
    parsed ? precisionOf(parsed.date) : "year"
  )
  const date = parsed?.date

  const commit = (next: DateParts) => {
    onChange(words(next))
    setOpen(false)
  }

  const showRemainder =
    !isMixed &&
    value === original &&
    originalParsed !== null &&
    originalParsed.remainder !== ""

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={id}
              disabled={disabled}
              autoFocus={autoFocus}
              aria-invalid={!!error}
              className={cn(
                "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-left type-ui-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
              )}
            />
          }
        >
          <span
            className={cn(
              "truncate",
              isMixed && "text-muted-foreground italic"
            )}
          >
            {isMixed ? "Mixed" : value}
          </span>
          <Icon
            name="chevron-down"
            className="size-3 shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <ToggleGroup
            aria-label="How precisely the date is known"
            value={[precision]}
            onValueChange={(next) => {
              const p = next[0] as Precision | undefined
              if (p) setPrecision(p)
            }}
            className="mb-2"
          >
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="year">Year</ToggleGroupItem>
          </ToggleGroup>
          {precision === "year" && (
            <YearSelect
              label="Year"
              value={date?.year}
              onChange={(year) => commit({ year })}
            />
          )}
          {precision === "month" && (
            <div className="flex items-center gap-1.5">
              <Select
                items={MONTHS.map((month, i) => ({
                  value: String(i + 1),
                  label: month,
                }))}
                value={date?.month ? String(date.month) : undefined}
                onValueChange={(month) => {
                  if (!month) return
                  commit({
                    year: date?.year ?? THIS_YEAR,
                    month: Number(month),
                  })
                }}
              >
                <SelectTrigger aria-label="Month" className="w-32">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MONTHS.map((month, i) => (
                      <SelectItem key={month} value={String(i + 1)}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <YearSelect
                label="Year"
                value={date?.year}
                onChange={(year) => commit({ year, month: date?.month ?? 1 })}
                className="w-24"
              />
            </div>
          )}
          {precision === "day" && (
            <Calendar
              mode="single"
              captionLayout="dropdown"
              startMonth={new Date(MIN_YEAR, 0)}
              endMonth={new Date(THIS_YEAR, 11)}
              defaultMonth={date ? toJsDate(date) : undefined}
              selected={date ? toJsDate(date) : undefined}
              onSelect={(picked) => {
                if (picked) commit(fromJsDate(picked))
              }}
            />
          )}
        </PopoverContent>
      </Popover>
      {showRemainder && (
        <Hint className="type-ui-xs italic">Originally: {original}</Hint>
      )}
      {error && <p className="type-ui-xs text-destructive">{error}</p>}
    </div>
  )
}

/** A year dropdown, 1850 to this year: the fast navigation the brief asks for. */
function YearSelect({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: number | undefined
  onChange: (year: number) => void
  className?: string
}) {
  return (
    <Select
      items={YEARS.map((year) => ({
        value: String(year),
        label: String(year),
      }))}
      value={value !== undefined ? String(value) : undefined}
      onValueChange={(year) => {
        if (year) onChange(Number(year))
      }}
    >
      <SelectTrigger aria-label={label} className={cn("w-28", className)}>
        <SelectValue placeholder="Year" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        <SelectGroup>
          {YEARS.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
