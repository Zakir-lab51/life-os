import { daysBetween, toISODate } from "./dates"
import { nextDueAfterCompletion } from "./recurrence"
import type { ID, ISODate, Task } from "./types"

export function isDone(task: Task) {
  return task.status === "done"
}

export function isOverdue(task: Task, today: ISODate) {
  return !isDone(task) && !!task.dueDate && daysBetween(today, task.dueDate) < 0
}

export function isDueToday(task: Task, today: ISODate) {
  return !isDone(task) && task.dueDate === today
}

/** Unfinished prerequisites. Missing (deleted) prerequisites don't block. */
export function blockingTasks(task: Task, byId: Map<ID, Task>): Task[] {
  return task.dependsOn.map((id) => byId.get(id)).filter((t): t is Task => !!t && !isDone(t))
}

export function isBlocked(task: Task, byId: Map<ID, Task>) {
  return blockingTasks(task, byId).length > 0
}

/** Number of open tasks waiting on this one. */
export function dependentsCount(task: Task, all: Task[]) {
  return all.filter((t) => !isDone(t) && t.dependsOn.includes(task.id)).length
}

/** Would making `taskId` depend on `candidateId` create a cycle? */
export function createsCycle(taskId: ID, candidateId: ID, byId: Map<ID, Task>): boolean {
  if (taskId === candidateId) return true
  const seen = new Set<ID>()
  const stack = [candidateId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    const t = byId.get(id)
    if (t) stack.push(...t.dependsOn)
  }
  return false
}

/** 0–1. Uses subtasks when present, otherwise the status. */
export function taskProgress(task: Task): number {
  if (isDone(task)) return 1
  if (task.subtasks.length) return task.subtasks.filter((s) => s.done).length / task.subtasks.length
  return task.status === "in_progress" ? 0.5 : 0
}

export interface CompletionResult {
  completed: Task
  /** The next instance when the task repeats. */
  next: Task | null
}

/**
 * Marks a task done. Recurring tasks spawn their next instance with a fresh id,
 * cleared subtasks and the reminder shifted by the same number of days.
 */
export function completeTask(task: Task, now: Date, newId: () => ID): CompletionResult {
  const stamp = now.toISOString()
  const completed: Task = { ...task, status: "done", completedAt: stamp, updatedAt: stamp }
  if (!task.recurrence) return { completed, next: null }

  const completedOn = toISODate(now)
  const nextDue = nextDueAfterCompletion(task.recurrence, task.dueDate, completedOn)
  let reminderAt: string | null = null
  if (task.reminderAt) {
    const shift = daysBetween(task.dueDate ?? completedOn, nextDue)
    const r = new Date(task.reminderAt)
    r.setDate(r.getDate() + shift)
    reminderAt = r.toISOString()
  }
  const next: Task = {
    ...task,
    id: newId(),
    nextId: null,
    status: "todo",
    dueDate: nextDue,
    reminderAt,
    reminderFired: false,
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    seriesId: task.seriesId ?? task.id,
    completedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
  completed.nextId = next.id
  return { completed, next }
}

export function reopenTask(task: Task, now: Date): Task {
  const stamp = now.toISOString()
  return { ...task, status: "todo", completedAt: null, nextId: null, updatedAt: stamp }
}

export type DueBucket = "overdue" | "today" | "upcoming" | "someday" | "done"

export function dueBucket(task: Task, today: ISODate): DueBucket {
  if (isDone(task)) return "done"
  if (!task.dueDate) return "someday"
  const diff = daysBetween(today, task.dueDate)
  if (diff < 0) return "overdue"
  if (diff === 0) return "today"
  return "upcoming"
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  someday: "No date",
  done: "Completed",
}

export function compareByDue(a: Task, b: Task) {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.dueDate && !b.dueDate) return -1
  if (!a.dueDate && b.dueDate) return 1
  if (a.priority !== b.priority) return a.priority - b.priority
  return a.order - b.order
}

export function compareByPriority(a: Task, b: Task) {
  if (a.priority !== b.priority) return a.priority - b.priority
  return compareByDue(a, b)
}

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32)
}
