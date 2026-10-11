import { daysBetween, formatDuration } from "./dates"
import { PRIORITY_META } from "./areas"
import { blockingTasks, dependentsCount, isDone } from "./tasks"
import type { ID, ISODate, Task } from "./types"

export interface Recommendation {
  task: Task
  score: number
  reasons: string[]
  blockedBy: Task[]
}

export interface ScoringContext {
  today: ISODate
  /** Unscheduled minutes left today. */
  freeMinutes: number
  all: Task[]
}

const IMPORTANCE: Record<Task["priority"], number> = { 1: 40, 2: 28, 3: 16, 4: 6 }

/**
 * Transparent scoring: importance (priority) + urgency (deadline) + a few
 * situational nudges. Every point added comes with a human-readable reason.
 */
export function scoreTask(task: Task, ctx: ScoringContext, byId: Map<ID, Task>): Recommendation {
  const reasons: string[] = []
  let score = IMPORTANCE[task.priority]
  if (task.priority <= 2) reasons.push(`${PRIORITY_META[task.priority].label} priority`)

  if (task.dueDate) {
    const diff = daysBetween(ctx.today, task.dueDate)
    if (diff < 0) {
      score += 40 + Math.min(-diff * 2, 10)
      reasons.push(diff === -1 ? "Overdue since yesterday" : `Overdue by ${-diff} days`)
    } else if (diff === 0) {
      score += 35
      reasons.push("Due today")
    } else if (diff === 1) {
      score += 25
      reasons.push("Due tomorrow")
    } else if (diff <= 3) {
      score += 18
      reasons.push(`Due in ${diff} days`)
    } else if (diff <= 7) {
      score += 10
      reasons.push("Due this week")
    }
  }

  if (task.status === "in_progress") {
    score += 5
    reasons.push("Already in progress")
  }

  const unblocks = dependentsCount(task, ctx.all)
  if (unblocks > 0) {
    score += 8
    reasons.push(unblocks === 1 ? "Unblocks another task" : `Unblocks ${unblocks} tasks`)
  }

  if (task.estimateMin <= 15) {
    score += 6
    reasons.push("Quick win")
  }

  if (ctx.freeMinutes > 0 && task.estimateMin > ctx.freeMinutes) {
    score -= 10
    reasons.push(`Needs ${formatDuration(task.estimateMin)}, more than today's ${formatDuration(ctx.freeMinutes)} of free time`)
  }

  const blockedBy = blockingTasks(task, byId)
  if (blockedBy.length) reasons.unshift(`Waiting on "${blockedBy[0].title}"${blockedBy.length > 1 ? ` +${blockedBy.length - 1}` : ""}`)

  return { task, score, reasons, blockedBy }
}

/** Open, unblocked tasks ranked by score. */
export function recommendTasks(all: Task[], ctx: Omit<ScoringContext, "all">, limit = 5): Recommendation[] {
  const byId = new Map(all.map((t) => [t.id, t]))
  const full = { ...ctx, all }
  return all
    .filter((t) => !isDone(t))
    .map((t) => scoreTask(t, full, byId))
    .filter((r) => r.blockedBy.length === 0)
    .sort((a, b) => b.score - a.score || a.task.order - b.task.order)
    .slice(0, limit)
}
