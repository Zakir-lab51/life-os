import type { FocusSession, Habit, Task } from "@/lib/domain/types"

let n = 0
const next = (p: string) => `${p}${++n}`

export function makeTask(t: Partial<Task> = {}): Task {
  return {
    id: next("t"),
    title: "Task",
    notes: "",
    status: "todo",
    priority: 3,
    area: "work",
    tags: [],
    dueDate: null,
    dueTime: null,
    reminderAt: null,
    reminderFired: false,
    estimateMin: 30,
    subtasks: [],
    recurrence: null,
    seriesId: null,
    nextId: null,
    dependsOn: [],
    order: 0,
    completedAt: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    ...t,
  }
}

export function makeHabit(h: Partial<Habit> = {}): Habit {
  return {
    id: next("h"),
    name: "Habit",
    icon: "Leaf",
    color: "violet",
    area: "health",
    schedule: { kind: "daily" },
    timeOfDay: "anytime",
    startDate: "2026-01-01",
    order: 1,
    archivedAt: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    ...h,
  }
}

export function makeSession(s: Partial<FocusSession> = {}): FocusSession {
  return {
    id: next("f"),
    mode: "pomodoro",
    date: "2026-03-10",
    startedAt: "2026-03-10T09:00:00.000Z",
    endedAt: "2026-03-10T09:25:00.000Z",
    plannedSec: 1500,
    actualSec: 1500,
    taskId: null,
    area: "study",
    completed: true,
    ...s,
  }
}

/** Local-time Date for a calendar day and clock time (tests run in any timezone). */
export function localDate(iso: string, h = 12, m = 0) {
  const [y, mo, d] = iso.split("-").map(Number)
  return new Date(y, mo - 1, d, h, m)
}
