"use client"

import { CalendarDays, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { addDays, daysBetween, fromISODate, relativeDayLabel, toISODate } from "@/lib/domain/dates"
import type { ISODate } from "@/lib/domain/types"
import { useToday } from "@/lib/db/hooks"
import { cn } from "@/lib/utils"

/** "Today · 11 Oct", "Friday · 16 Oct", then just the date (with the year when it isn't this year). */
function pickerLabel(value: ISODate, today: ISODate) {
  const d = fromISODate(value)
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== fromISODate(today).getFullYear() && { year: "numeric" }) })
  const diff = daysBetween(today, value)
  return diff >= -1 && diff < 7 ? `${relativeDayLabel(value, today)} · ${date}` : date
}

export function DatePicker({
  value,
  onChange,
  placeholder = "No date",
  allowClear = true,
  id,
  invalid,
}: {
  value: ISODate | null
  onChange: (v: ISODate | null) => void
  placeholder?: string
  allowClear?: boolean
  id?: string
  invalid?: boolean
}) {
  const today = useToday()
  const [open, setOpen] = useState(false)
  const pick = (v: ISODate | null) => {
    onChange(v)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" aria-invalid={invalid} className={cn("h-10 flex-1 justify-start rounded-xl font-normal", !value && "text-muted-foreground")}>
            <CalendarDays className="size-4" />
            {value ? pickerLabel(value, today) : placeholder}
          </Button>
        </PopoverTrigger>
        {allowClear && value && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear date" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
      <PopoverContent align="start" className="w-auto rounded-2xl p-2">
        <div className="mb-2 flex gap-1 px-1">
          {[
            ["Today", today],
            ["Tomorrow", addDays(today, 1)],
            ["Next week", addDays(today, 7)],
          ].map(([label, d]) => (
            <Button key={label} type="button" size="xs" variant="secondary" onClick={() => pick(d)}>
              {label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={value ? fromISODate(value) : undefined}
          defaultMonth={value ? fromISODate(value) : fromISODate(today)}
          onSelect={(d) => pick(d ? toISODate(d) : null)}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  )
}
