"use client"

import { useMemo } from "react"
import { AREA_META } from "@/lib/domain/areas"
import { daysBetween, formatDay, toISODate } from "@/lib/domain/dates"
import { HORIZON_META, OUTLOOK_META, evaluateGoals, type Forecast, type HistoryPoint } from "@/lib/domain/goals"
import type { Goal, GoalHorizon } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"

/** Progress and forecasts for every goal, recomputed whenever the underlying records change. */
export function useGoalEvaluations(life: Life | undefined) {
  return useMemo(() => (life ? evaluateGoals(life.data.goals, { tasks: life.data.tasks, habitLogs: life.data.habitLogs, goalLogs: life.data.goalLogs }, life.today) : new Map()), [life])
}

const TONE: Record<string, string> = {
  mint: "bg-mint/18 text-foreground ring-mint/35",
  violet: "bg-violet/15 text-foreground ring-violet/30",
  amber: "bg-amber/20 text-foreground ring-amber/40",
  rose: "bg-rose/18 text-foreground ring-rose/35",
  muted: "bg-surface-3/80 text-muted-foreground ring-line",
}
const DOT: Record<string, string> = { mint: "bg-mint", violet: "bg-violet", amber: "bg-amber", rose: "bg-rose", muted: "bg-muted-foreground/50" }

export function OutlookBadge({ forecast, className }: { forecast: Forecast; className?: string }) {
  const meta = OUTLOOK_META[forecast.outlook]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", TONE[meta.tone], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[meta.tone])} />
      {meta.label}
    </span>
  )
}

export function HorizonChip({ horizon, className }: { horizon: GoalHorizon; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-surface-3/80 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase ring-1 ring-line", className)}>{HORIZON_META[horizon].adjective}</span>
}

export function AreaDot({ goal, className }: { goal: Pick<Goal, "area">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <span className="size-2 rounded-full" style={{ background: AREA_META[goal.area].color }} />
      {AREA_META[goal.area].label}
    </span>
  )
}

/** "12 days left", "Due today", "3 days overdue", "Achieved 4 Mar" … */
export function dueText(goal: Goal, today: string): string {
  if (goal.status === "done" && goal.completedAt) return `Achieved ${formatDay(toISODate(new Date(goal.completedAt)), "d MMM yyyy")}`
  if (!goal.dueDate) return "No deadline"
  const d = daysBetween(today, goal.dueDate)
  if (d === 0) return "Due today"
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`
  if (d < 60) return `${d} day${d === 1 ? "" : "s"} left`
  if (d < 730) return `${Math.round(d / 30)} months left`
  return `${(d / 365).toFixed(1)} years left`
}

/** A plain-language read of the forecast for the goal detail. */
export function forecastSentence(goal: Goal, f: Forecast, ratio: number): string {
  if (goal.status === "done") return "Achieved. Well done."
  if (ratio >= 1) return "Everything's done. Mark it achieved when you're ready."
  const expected = f.expected === null || f.expected < 0.01 ? "" : ` On an even pace you'd be at ${Math.round(f.expected * 100)}% by now.`
  if (f.outlook === "not-started") return `Nothing logged yet. Once you make progress, you'll see when you're likely to finish.${expected}`
  if (!f.predicted && f.early) return "Early days. A likely finish date appears after a few days of progress."
  if (!f.predicted) return `${ratio === 0 ? "No progress yet" : "No progress in the last few weeks"}, so there's no finish date to predict.${expected}`
  const when = formatDay(f.predicted, "d MMM yyyy")
  if (!goal.dueDate) return `At your recent pace you'll finish around ${when}.`
  const margin = daysBetween(f.predicted, goal.dueDate)
  const verdict = margin >= 0 ? `${margin === 0 ? "right on" : `${margin} day${margin === 1 ? "" : "s"} before`} the deadline` : `${-margin} day${margin === -1 ? "" : "s"} after the deadline`
  return `At your recent pace you'll finish around ${when}, ${verdict}.${expected}`
}

/**
 * Tiny progress chart: actual progress as a filled step line, and a dashed line for
 * an even pace from start to deadline. Purely visual; numbers are shown alongside.
 */
export function Sparkline({ goal, history, today, className }: { goal: Goal; history: HistoryPoint[]; today: string; className?: string }) {
  const end = goal.dueDate && goal.dueDate > today ? goal.dueDate : today
  const span = Math.max(1, daysBetween(goal.startDate, end))
  const x = (date: string) => (Math.min(span, Math.max(0, daysBetween(goal.startDate, date))) / span) * 100
  const y = (r: number) => 30 - r * 28
  let d = ""
  history.forEach((p, i) => {
    const px = x(p.date)
    d += i === 0 ? `M${px},${y(p.ratio)}` : `H${px}V${y(p.ratio)}`
  })
  const last = history[history.length - 1]
  const area = last ? `${d}H${x(last.date)}V30H${x(history[0].date)}Z` : ""
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} aria-hidden>
      {goal.dueDate && <line x1="0" y1="30" x2={x(goal.dueDate)} y2="2" stroke="var(--muted-foreground)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
      <path d={area} fill="var(--violet)" fillOpacity="0.14" />
      <path d={d} fill="none" stroke="var(--violet)" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1={x(today)} y1="0" x2={x(today)} y2="32" stroke="var(--foreground)" strokeOpacity="0.15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
