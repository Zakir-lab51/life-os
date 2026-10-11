import { addDays, daysBetween, toISODate } from "./dates"
import { bestStreak, currentStreak, logsByHabit } from "./habits"
import { isOverdue } from "./tasks"
import type { ISODate } from "./types"
import type { LifeData } from "./scores"

export interface Insight {
  id: string
  title: string
  body: string
  /** Why LIFE OS is saying this: the numbers behind it. */
  basis: string
  weight: number
  href?: string
}

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]

/** Insights derived only from recorded data. Returns an empty list when there isn't enough to say anything honest. */
export function generateInsights(data: LifeData, today: ISODate, weekStartsOn: 0 | 1 = 1): Insight[] {
  const out: Insight[] = []
  const byHabit = logsByHabit(data.habitLogs)

  // 1. Streaks close to a personal best
  for (const h of data.habits) {
    if (h.archivedAt) continue
    const done = byHabit.get(h.id) ?? new Set<ISODate>()
    const cur = currentStreak(h, done, today, weekStartsOn)
    const best = bestStreak(h, done, today, weekStartsOn)
    const unit = cur.unit === "week" ? "week" : "day"
    if (cur.current >= 3 && cur.current === best) {
      out.push({
        id: `best-${h.id}`,
        title: `${h.name} is at an all-time high`,
        body: `${cur.current} ${unit}s in a row, your longest yet. Keep it going today.`,
        basis: `Current streak ${cur.current} = best streak ${best}.`,
        weight: 70 + cur.current,
        href: "/habits",
      })
    } else if (cur.current >= 3 && best - cur.current <= 2) {
      const gap = best - cur.current + 1
      out.push({
        id: `near-${h.id}`,
        title: `${gap} more ${unit}${gap > 1 ? "s" : ""} beats your ${h.name} record`,
        body: `You're on ${cur.current}; your best is ${best}.`,
        basis: `Current streak ${cur.current}, best ${best}.`,
        weight: 65,
        href: "/habits",
      })
    } else if (cur.restDaysUsed > 0 && cur.current >= 3) {
      out.push({
        id: `rest-${h.id}`,
        title: `A rest day kept your ${h.name} streak alive`,
        body: `One missed day in a week doesn't reset you. You're still on ${cur.current} ${unit}s.`,
        basis: `${cur.restDaysUsed} rest day${cur.restDaysUsed > 1 ? "s" : ""} used in the current streak.`,
        weight: 40,
        href: "/habits",
      })
    }
  }

  // 2. Best weekday for getting things done (needs a few weeks of data)
  {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    const from = addDays(today, -27)
    let total = 0
    for (const t of data.tasks) {
      if (t.status !== "done" || !t.completedAt) continue
      const d = toISODate(new Date(t.completedAt))
      if (daysBetween(from, d) < 0 || daysBetween(d, today) < 0) continue
      counts[new Date(t.completedAt).getDay()]++
      total++
    }
    if (total >= 10) {
      const best = counts.indexOf(Math.max(...counts))
      const avg = counts[best] / 4
      out.push({
        id: "best-weekday",
        title: `${DAY_NAMES[best]} are your most productive`,
        body: `You finish about ${avg.toFixed(1)} tasks on ${DAY_NAMES[best].toLowerCase()}. Put your hardest work there.`,
        basis: `${total} tasks finished in the last 4 weeks; ${counts[best]} of them on ${DAY_NAMES[best]}.`,
        weight: 50,
        href: "/analytics",
      })
    }
  }

  // 3. Focus trend, this week vs last 7 days before it
  {
    const sumBetween = (a: ISODate, b: ISODate) =>
      data.sessions.filter((s) => daysBetween(a, s.date) >= 0 && daysBetween(s.date, b) >= 0).reduce((acc, s) => acc + s.actualSec / 60, 0)
    const recent = sumBetween(addDays(today, -6), today)
    const before = sumBetween(addDays(today, -13), addDays(today, -7))
    if (recent > 0 && before > 0) {
      const change = (recent - before) / before
      if (Math.abs(change) >= 0.2) {
        const up = change > 0
        out.push({
          id: "focus-trend",
          title: up ? `Focus is up ${Math.round(change * 100)}%` : `Focus is down ${Math.round(-change * 100)}%`,
          body: up ? "Your deep work is compounding. Protect the time slots that made it happen." : "A single focused block today is enough to turn the trend around.",
          basis: `${Math.round(recent)} min in the last 7 days vs ${Math.round(before)} min the 7 days before.`,
          weight: 55,
          href: "/focus",
        })
      }
    }
  }

  // 4. Overdue pile-up
  {
    const overdue = data.tasks.filter((t) => isOverdue(t, today)).length
    if (overdue >= 3) {
      out.push({
        id: "overdue",
        title: `${overdue} tasks are overdue`,
        body: "Rescheduling them in My Day takes a minute and clears the mental load.",
        basis: `${overdue} open tasks have a due date before today.`,
        weight: 60 + overdue,
        href: "/today",
      })
    }
  }

  return out.sort((a, b) => b.weight - a.weight)
}
