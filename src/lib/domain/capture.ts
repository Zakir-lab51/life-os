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

/**
 * Quick-capture syntax, all optional:
 *   !1 … !4   priority (or !!! / !! / !)
 *   #tag      tags
 *   @area     work, study, health, mind, personal, finance
 *   today, tomorrow (tmr), a weekday name, or 2026-10-14
 *   30m, 1h, 1h30m, 90min   estimate
 * Example: "Revise anatomy notes tomorrow !2 #exam @study 45m"
 */
export function parseCapture(input: string, today: ISODate): CaptureResult {
  const result: CaptureResult = { title: "", priority: null, tags: [], dueDate: null, estimateMin: null, area: null }
  const kept: string[] = []

  for (const raw of input.trim().split(/\s+/)) {
    if (!raw) continue
    const token = raw.toLowerCase()

    const prio = /^!([1-4])$/.exec(token)
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

    if (token === "today" || token === "tod") { result.dueDate = today; continue }
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
