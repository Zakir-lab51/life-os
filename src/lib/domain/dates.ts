import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek as dfStartOfWeek,
} from "date-fns"
import type { ISODate } from "./types"

/** Local calendar day of a Date, as `yyyy-MM-dd`. */
export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd")
}

/** Local midnight of an ISO calendar day. */
export function fromISODate(iso: ISODate): Date {
  return parseISO(iso)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISODate(dfAddDays(fromISODate(iso), n))
}

export function addMonths(iso: ISODate, n: number): ISODate {
  return toISODate(dfAddMonths(fromISODate(iso), n))
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(b), fromISODate(a))
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: ISODate): number {
  return fromISODate(iso).getDay()
}

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  return toISODate(dfStartOfWeek(fromISODate(iso), { weekStartsOn }))
}

/** Inclusive list of days from `from` to `to`. */
export function dayRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  const n = daysBetween(from, to)
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 570 → "09:30" */
export function minutesToHHMM(min: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(min)))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

/** "09:30" → 570; returns null for malformed input. */
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null
  return h * 60 + m
}

/** 570 → "9:30 am" */
export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const suffix = h24 < 12 ? "am" : "pm"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`
}

export function formatDuration(totalMin: number): string {
  const m = Math.round(totalMin)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

/** Human label for a due date relative to today. */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  if (diff < 0) return `${-diff}d overdue`
  if (diff < 7) return format(fromISODate(iso), "EEEE")
  return format(fromISODate(iso), "d MMM")
}

export function formatDay(iso: ISODate, pattern = "EEE, d MMM"): string {
  return format(fromISODate(iso), pattern)
}

export function roundUpTo(min: number, step: number): number {
  return Math.ceil(min / step) * step
}

export function snapTo(min: number, step: number): number {
  return Math.round(min / step) * step
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
