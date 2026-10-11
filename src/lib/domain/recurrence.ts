import { addDays, addMonths, daysBetween, startOfWeek, weekday } from "./dates"
import type { ISODate, Recurrence } from "./types"

/** The occurrence that directly follows `from` under this rule. */
export function nextOccurrence(rule: Recurrence, from: ISODate): ISODate {
  const interval = Math.max(1, Math.floor(rule.interval || 1))

  if (rule.freq === "daily") return addDays(from, interval)
  if (rule.freq === "monthly") return addMonths(from, interval)

  // weekly
  const days = [...new Set(rule.weekdays ?? [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (days.length === 0) return addDays(from, 7 * interval)

  // a later weekday in the same week?
  const current = weekday(from)
  const later = days.find((d) => d > current)
  if (later !== undefined) return addDays(from, later - current)

  // otherwise the first listed weekday, `interval` weeks on (weeks start on Sunday here)
  const weekStart = startOfWeek(from, 0)
  return addDays(weekStart, 7 * interval + days[0])
}

/**
 * When a recurring task is completed, its next instance is due on the first
 * occurrence after the current due date that is also after the completion day.
 * Finishing an overdue daily task today schedules the next one for tomorrow,
 * not for a day that has already passed.
 */
export function nextDueAfterCompletion(rule: Recurrence, dueDate: ISODate | null, completedOn: ISODate): ISODate {
  let next = nextOccurrence(rule, dueDate ?? completedOn)
  let guard = 0
  while (daysBetween(completedOn, next) <= 0 && guard < 1000) {
    next = nextOccurrence(rule, next)
    guard++
  }
  return next
}

export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return "Does not repeat"
  const n = Math.max(1, rule.interval)
  if (rule.freq === "daily") return n === 1 ? "Every day" : `Every ${n} days`
  if (rule.freq === "monthly") return n === 1 ? "Every month" : `Every ${n} months`
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const days = (rule.weekdays ?? []).slice().sort((a, b) => a - b).map((d) => names[d])
  const base = n === 1 ? "Every week" : `Every ${n} weeks`
  return days.length ? `${base} on ${days.join(", ")}` : base
}
