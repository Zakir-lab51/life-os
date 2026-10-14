import { addDays, daysBetween, weekday } from "./dates"
import type { BlockSeries, ID, ISODate } from "./types"

/*
  Repeating blocks (a class timetable, a weekly gym slot). A series keeps the pattern; each
  day it falls on gets an ordinary block, made ahead of time, whose id is the series id and
  the date. So two devices that both make the same day's block make the same one (sync
  merges them), and a day you remove is remembered in `skip` so it isn't made again.
*/

/** How far ahead repeating blocks are put on the timeline. */
export const SERIES_AHEAD_DAYS = 28

export const occurrenceId = (seriesId: ID, date: ISODate) => `${seriesId}:${date}`

/** The days from `from` to `to` (inclusive) that the series falls on. */
export function seriesDates(s: Pick<BlockSeries, "days" | "from" | "until" | "skip">, from: ISODate, to: ISODate): ISODate[] {
  const start = daysBetween(s.from, from) > 0 ? from : s.from
  const end = s.until && daysBetween(s.until, to) > 0 ? s.until : to
  const out: ISODate[] = []
  if (!s.days.length) return out
  for (let d = start; daysBetween(d, end) >= 0; d = addDays(d, 1)) {
    if (s.days.includes(weekday(d)) && !s.skip.includes(d)) out.push(d)
  }
  return out
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri" (in the order of your week). */
export function describeDays(days: number[], weekStartsOn: 0 | 1 = 1): string {
  const set = [...new Set(days)].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7))
  if (set.length === 7) return "Every day"
  if (set.length === 5 && [1, 2, 3, 4, 5].every((d) => set.includes(d))) return "Weekdays"
  if (set.length === 2 && set.includes(0) && set.includes(6)) return "Weekends"
  return set.map((d) => NAMES[d]).join(", ")
}
