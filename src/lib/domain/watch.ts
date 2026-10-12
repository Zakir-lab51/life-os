import { formatClock, formatDuration, minutesOfDay } from "./dates"
import { elapsedMs, formatTimer, remainingMs, type TimerState } from "./focus"
import { moonPhase, moonPhaseName } from "./moon"
import { dayProgress } from "./planner"

export interface WatchReadout {
  /** Hours and minutes as the locale writes them ("5", "42"), and "PM"/"AM" where it uses them. */
  hour: string
  minute: string
  period: string | null
  /** "MON" */
  weekday: string
  day: number
  moon: number
  /** Share of your day still ahead, 0–1. */
  dayLeft: number
  focus: {
    state: TimerState["status"]
    /** A break counts as rest, coloured apart from focus. */
    rest: boolean
    /** What the focus complication says: "Focus · 25m", "18:32", "Paused 18:32". */
    text: string
    /** How far through the session, 0–1; null when idle or for the open-ended stopwatch. */
    progress: number | null
  }
  /** Everything above, in words, for screen readers. */
  label: string
}

/** What the sidebar's digital watch shows at `date`. */
export function watchReadout(
  date: Date,
  timer: TimerState,
  { dayStart, dayEnd, focusMin, locale }: { dayStart: number; dayEnd: number; focusMin: number; locale?: string },
): WatchReadout {
  const parts = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? null
  const minute = minutesOfDay(date)
  const now = date.getTime()
  const elapsed = timer.status === "idle" ? 0 : elapsedMs(timer, now)
  const remaining = timer.status === "idle" ? null : remainingMs(timer, now)
  const shown = remaining ?? elapsed
  const rest = timer.status !== "idle" && timer.phase !== "focus"
  const focusText = timer.status === "idle" ? `Focus · ${focusMin}m` : timer.status === "paused" ? `Paused ${formatTimer(shown)}` : formatTimer(shown)
  const progress = timer.status === "idle" || timer.plannedMs === null || timer.plannedMs <= 0 ? null : Math.min(1, elapsed / timer.plannedMs)
  const dayLeft = 1 - dayProgress(minute, dayStart, dayEnd)
  const phase = moonPhase(date)

  const label = [
    `Time ${formatClock(minute)}`,
    timer.status === "idle"
      ? "Focus not running"
      : `${rest ? "Break" : "Focus"} ${timer.status === "running" ? "running" : "paused"}, ${remaining === null ? `${formatDuration(elapsed / 60_000)} in` : `${formatTimer(remaining)} left`}`,
    minute < dayStart ? `Your day starts at ${formatClock(dayStart)}` : minute >= dayEnd ? "Your day is over" : `${formatDuration(dayEnd - minute)} of your day left`,
    moonPhaseName(phase),
    date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }),
  ].join(". ")

  return {
    hour: part("hour") ?? String(date.getHours()),
    minute: part("minute") ?? String(date.getMinutes()).padStart(2, "0"),
    period: part("dayPeriod")?.toUpperCase() ?? null,
    weekday: date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "").toUpperCase(),
    day: date.getDate(),
    moon: phase,
    dayLeft,
    focus: { state: timer.status, rest, text: focusText, progress },
    label,
  }
}
