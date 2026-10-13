"use client"

import { CalendarDays } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useBlocksBetween } from "@/lib/db/hooks"
import { addDays, fromISODate, toISODate } from "@/lib/domain/dates"
import type { ISODate } from "@/lib/domain/types"

// a dot under the days that already have blocks, in the number's colour on the chosen day (::after is the touch target)
const PLANNED =
  "[&_button]:before:absolute [&_button]:before:bottom-[3px] [&_button]:before:left-1/2 [&_button]:before:size-1 [&_button]:before:-translate-x-1/2 [&_button]:before:rounded-full [&_button]:before:bg-violet [&[data-selected=true]_button]:before:bg-current"

/** Go straight to any day in My Day: a month calendar, with the days that already have blocks marked. */
export function DayJump({ date, onPick }: { date: ISODate; onPick: (date: ISODate) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Go to a date">
          <CalendarDays />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto rounded-2xl p-2">
        <Month
          date={date}
          onPick={(d) => {
            onPick(d)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

// mounted only while the calendar is open, so the blocks are read only then
function Month({ date, onPick }: { date: ISODate; onPick: (date: ISODate) => void }) {
  const [month, setMonth] = useState(() => fromISODate(date))
  const first = toISODate(new Date(month.getFullYear(), month.getMonth(), 1))
  // the weeks shown can start up to six days before the 1st and run up to six weeks
  const blocks = useBlocksBetween(addDays(first, -7), addDays(first, 42))
  const planned = useMemo(() => [...new Set((blocks ?? []).map((b) => b.date))].map(fromISODate), [blocks])
  return (
    <Calendar
      mode="single"
      selected={fromISODate(date)}
      month={month}
      onMonthChange={setMonth}
      onDayClick={(d) => onPick(toISODate(d))}
      weekStartsOn={1}
      modifiers={{ planned }}
      modifiersClassNames={{ planned: PLANNED }}
    />
  )
}
