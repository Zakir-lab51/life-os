import { addDays, daysBetween, weekday } from "./dates"
import { normalizeTag } from "./tasks"
import { AREAS, type Area, type ISODate, type Priority } from "./types"

export interface CaptureResult {
  title: string
  priority: Priority | null
  tags: string[]
  dueDate: ISODate | null
  estimateMin: number | null
  area: Area | null
}

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

/** The Monday after `today`. */
const nextMonday = (today: ISODate) => addDays(today, 7 - ((weekday(today) + 6) % 7))

/** Day and month (0-based) as a date this year, or next year if it has already passed. */
function dayMonth(day: number, month: number, today: ISODate, year?: number): ISODate | null {
  const thisYear = Number(today.slice(0, 4))
  for (const y of year ? [year] : [thisYear, thisYear + 1]) {
    const d = new Date(y, month, day)
    if (d.getMonth() !== month || d.getDate() !== day) return null
    const iso = `${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    if (year || daysBetween(today, iso) >= 0) return iso
  }
  return null
}

/**
 * Quick-capture syntax, all optional:
 *   !1 … !4 or p1 … p4   priority (or !!! / !!)
 *   #tag      tags
 *   @area     work, study, health, mind, personal, finance
 *   today, tonight, tomorrow (tmr), a weekday, next week, next fri, in 3 days, in 2 weeks,
 *   14 oct, oct 14, 14/10 (day/month), 14/10/2026, or 2026-10-14
 *   30m, 1h, 1h30m, 90min   estimate
 * Example: "Revise anatomy notes tomorrow p2 #exam @study 45m"
 */
export function parseCapture(input: string, today: ISODate): CaptureResult {
  const result: CaptureResult = { title: "", priority: null, tags: [], dueDate: null, estimateMin: null, area: null }
  const kept: string[] = []
  const tokens = input.trim().split(/\s+/)

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i]
    if (!raw) continue
    const token = raw.toLowerCase()
    const next = tokens[i + 1]?.toLowerCase() ?? ""
    const after = tokens[i + 2]?.toLowerCase() ?? ""

    const prio = /^[!p]([1-4])$/.exec(token)
    if (prio) { result.priority = Number(prio[1]) as Priority; continue }
    if (token === "!!!") { result.priority = 1; continue }
    if (token === "!!") { result.priority = 2; continue }

    if (/^#[\p{L}\p{N}_-]+$/u.test(raw)) {
      const tag = normalizeTag(raw)
      if (tag && !result.tags.includes(tag)) result.tags.push(tag)
      continue
    }

    const area = /^@([a-z]+)$/.exec(token)
    if (area && (AREAS as readonly string[]).includes(area[1])) { result.area = area[1] as Area; continue }

    if (token === "today" || token === "tod" || token === "tonight") { result.dueDate = today; continue }
    if (token === "next" && next === "week") { result.dueDate = nextMonday(today); i++; continue }
    if (token === "next" && next in DAY_WORDS) { result.dueDate = addDays(nextMonday(today), (DAY_WORDS[next] + 6) % 7); i++; continue }
    const inN = token === "in" ? /^(\d{1,3})$/.exec(next) : null
    if (inN && /^(days?|weeks?)$/.test(after)) {
      result.dueDate = addDays(today, Number(inN[1]) * (after.startsWith("week") ? 7 : 1))
      i += 2
      continue
    }
    // 14 oct, oct 14
    if (/^\d{1,2}$/.test(token) && next in MONTHS) {
      const d = dayMonth(Number(token), MONTHS[next], today)
      if (d) { result.dueDate = d; i++; continue }
    }
    if (token in MONTHS && /^\d{1,2}$/.test(next)) {
      const d = dayMonth(Number(next), MONTHS[token], today)
      if (d) { result.dueDate = d; i++; continue }
    }
    // 14/10 or 14/10/2026: day first, as written in India
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(token)
    if (slash) {
      const d = dayMonth(Number(slash[1]), Number(slash[2]) - 1, today, slash[3] ? Number(slash[3]) : undefined)
      if (d) { result.dueDate = d; continue }
    }
    if (token === "tomorrow" || token === "tmr" || token === "tmrw") { result.dueDate = addDays(today, 1); continue }
    if (token in DAY_WORDS) {
      const target = DAY_WORDS[token]
      const diff = (target - weekday(today) + 7) % 7
      result.dueDate = addDays(today, diff)
      continue
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(token) && !Number.isNaN(Date.parse(token))) {
      result.dueDate = token
      continue
    }

    const duration = /^(?:(\d+)h)?(?:(\d+)(?:m|min|mins))?$/.exec(token)
    if (duration && (duration[1] || duration[2])) {
      const minutes = Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0)
      if (minutes > 0 && minutes <= 12 * 60) { result.estimateMin = minutes; continue }
    }

    kept.push(raw)
  }

  result.title = kept.join(" ").trim()
  // a due date before today makes no sense for new work: keep it but never earlier than today
  if (result.dueDate && daysBetween(today, result.dueDate) < 0) result.dueDate = today
  return result
}
