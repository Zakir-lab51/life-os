"use client"

import { addDays, formatDay, startOfWeek } from "@/lib/domain/dates"
import type { ISODate } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/** One hue, light to strong: the sequential scale for "how much". */
const LEVELS = ["bg-surface-3", "bg-violet/30", "bg-violet/55", "bg-violet/80", "bg-violet"]

function level(v: number | null) {
  if (v === null || v <= 0) return 0
  if (v < 0.34) return 1
  if (v < 0.67) return 2
  if (v < 1) return 3
  return 4
}

/**
 * GitHub-style calendar heatmap. `value(date)` returns 0–1, or null for days
 * that don't count (before tracking started, or not scheduled).
 */
export function Heatmap({
  end,
  weeks = 20,
  value,
  describe,
  weekStartsOn = 1,
  cell = 12,
  label,
}: {
  end: ISODate
  weeks?: number
  value: (d: ISODate) => number | null
  describe: (d: ISODate, v: number | null) => string
  weekStartsOn?: 0 | 1
  cell?: number
  label: string
}) {
  const first = addDays(startOfWeek(end, weekStartsOn), -7 * (weeks - 1))
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
  const dayNames = weekStartsOn === 1 ? ["M", "", "W", "", "F", "", ""] : ["", "M", "", "W", "", "F", ""]
  let filled = 0
  let counted = 0

  const grid = cols.map((col, ci) => {
    const month = col[0].slice(8, 10) <= "07" ? formatDay(col[0], "MMM") : null
    return (
      <div key={ci} className="flex flex-col gap-[3px]">
        <span className="h-3 text-[9px] leading-3 text-muted-foreground">{month}</span>
        {col.map((d) => {
          const future = d > end
          const v = future ? null : value(d)
          if (v !== null) {
            counted++
            if (v > 0) filled++
          }
          return (
            <span
              key={d}
              title={future ? undefined : describe(d, v)}
              className={cn("rounded-[3px] transition-transform hover:scale-125", future ? "bg-transparent" : v === null ? "bg-surface-2/60" : LEVELS[level(v)])}
              style={{ width: cell, height: cell }}
            />
          )
        })}
      </div>
    )
  })

  return (
    <div role="img" aria-label={`${label}: ${filled} of ${counted} tracked days active over the last ${weeks} weeks`}>
      <div className="no-scrollbar flex gap-[3px] overflow-x-auto">
        <div className="flex flex-col gap-[3px] pr-1">
          <span className="h-3" />
          {dayNames.map((n, i) => (
            <span key={i} className="text-[9px] leading-none text-muted-foreground" style={{ height: cell, lineHeight: `${cell}px` }}>
              {n}
            </span>
          ))}
        </div>
        {grid}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground" aria-hidden>
        Less
        {LEVELS.map((c) => (
          <span key={c} className={cn("size-2.5 rounded-[3px]", c)} />
        ))}
        More
      </div>
    </div>
  )
}
