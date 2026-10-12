import { compareByDue } from "@/lib/domain/tasks"
import type { Task, TaskStatus } from "@/lib/domain/types"

export const BOARD_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"]

/**
 * The cards in each Kanban column. A move already dropped (`pending`) shows at once,
 * before the database reports it; the card being dragged shows in the column it is over,
 * so it lands where it will stay. Open work is ordered by due date and urgency; finished
 * work most recent first, with a card arriving in Done at the top.
 */
export function arrangeBoard(tasks: Task[], pending: ReadonlyMap<string, TaskStatus>, dragging: { id: string; over: TaskStatus | null } | null): Record<TaskStatus, Task[]> {
  const statusOf = (t: Task) => pending.get(t.id) ?? (dragging?.id === t.id && dragging.over ? dragging.over : t.status)
  // a card on its way into Done counts as finished now (after any real timestamp)
  const finishedAt = (t: Task) => (t.status === "done" ? (t.completedAt ?? "") : "9999")
  const columns = Object.fromEntries(BOARD_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>
  for (const t of tasks) columns[statusOf(t)]?.push(t)
  for (const s of BOARD_STATUSES) columns[s].sort(s === "done" ? (a, b) => finishedAt(b).localeCompare(finishedAt(a)) : compareByDue)
  return columns
}

/** Drops pending moves the tasks now show (or whose task is gone). Returns the same map when nothing changed. */
export function settlePending(pending: ReadonlyMap<string, TaskStatus>, byId: ReadonlyMap<string, Task>): ReadonlyMap<string, TaskStatus> {
  const keep = [...pending].filter(([id, status]) => byId.has(id) && byId.get(id)?.status !== status)
  return keep.length === pending.size ? pending : new Map(keep)
}
