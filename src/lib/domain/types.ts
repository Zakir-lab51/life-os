
import type { Design } from "@/lib/design/design"

/*
  Core LIFE OS records. Every record has a stable string id and ISO timestamps.
  Dates without a time ("2026-10-10") are local calendar days; times of day are
  stored as minutes after midnight so planner math stays simple.
*/

export type ID = string
/** Local calendar day, `yyyy-MM-dd`. */
export type ISODate = string
/** Full ISO-8601 timestamp. */
export type ISODateTime = string

/** Life areas shared by tasks, habits and focus sessions. They feed the Life Balance radar. */
export const AREAS = ["work", "study", "health", "mind", "personal", "finance"] as const
export type Area = (typeof AREAS)[number]

/** 1 = urgent, 2 = high, 3 = medium, 4 = low */
export type Priority = 1 | 2 | 3 | 4
export type TaskStatus = "todo" | "in_progress" | "done"

export interface Subtask {
  id: ID
  title: string
  done: boolean
}

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly"
  /** Repeat every N days / weeks / months. */
  interval: number
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[]
}

export interface Task {
  id: ID
  title: string
  notes: string
  status: TaskStatus
  priority: Priority
  area: Area
  tags: string[]
  dueDate: ISODate | null
  /** "HH:mm" */
  dueTime: string | null
  reminderAt: ISODateTime | null
  reminderFired: boolean
  /** Estimated duration in minutes. */
  estimateMin: number
  subtasks: Subtask[]
  recurrence: Recurrence | null
  /** Shared by every instance of a recurring task. */
  seriesId: ID | null
  /** Set on a completed recurring task: the instance its completion created. */
  nextId?: ID | null
  /** Ids of tasks that must be finished first. */
  dependsOn: ID[]
  /** Manual ordering for list and board views. */
  order: number
  completedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

export type HabitSchedule =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] }
  | { kind: "weekly"; times: number }

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime"

export interface Habit {
  id: ID
  name: string
  icon: string
  color: AccentColor
  area: Area
  schedule: HabitSchedule
  timeOfDay: TimeOfDay
  startDate: ISODate
  order: number
  archivedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

export interface HabitLog {
  /** `${habitId}:${date}`: one check-in per habit per day, so duplicates are impossible. */
  id: string
  habitId: ID
  date: ISODate
  createdAt: ISODateTime
  demo?: boolean
}

export type AccentColor = "violet" | "cyan" | "blue" | "mint" | "amber" | "rose" | "lilac"

export type BlockKind = "task" | "focus" | "break" | "event" | "routine" | "habit"

export interface Block {
  id: ID
  date: ISODate
  /** Minutes after midnight. */
  start: number
  end: number
  title: string
  kind: BlockKind
  taskId: ID | null
  notes: string
  source: "manual" | "plan"
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

export interface FocusSession {
  id: ID
  mode: FocusMode
  date: ISODate
  startedAt: ISODateTime
  endedAt: ISODateTime
  plannedSec: number | null
  actualSec: number
  taskId: ID | null
  area: Area | null
  /** True when the planned duration ran out; false when stopped early. */
  completed: boolean
  demo?: boolean
}

export type FocusMode = "pomodoro" | "custom" | "stopwatch"

export interface Reflection {
  /** One per day: the date itself. */
  id: ISODate
  date: ISODate
  mood: 1 | 2 | 3 | 4 | 5
  wins: string
  improve: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

export interface RoutineCheck {
  /** `${date}:${itemId}` */
  id: string
  date: ISODate
  itemId: ID
  createdAt: ISODateTime
  demo?: boolean
}

export type ActivityType =
  | "task.created"
  | "task.completed"
  | "habit.checked"
  | "focus.completed"
  | "focus.stopped"
  | "reflection.saved"
  | "plan.applied"
  | "achievement.unlocked"
  | "level.up"

export interface ActivityEvent {
  id: ID
  type: ActivityType
  at: ISODateTime
  title: string
  refId: ID | null
  area: Area | null
  /** Unique: re-doing the same thing never creates a second event. */
  dedupeKey: string
  demo?: boolean
}

export type NotificationKind = "reminder" | "focus" | "achievement" | "level" | "system"

export interface AppNotification {
  id: ID
  kind: NotificationKind
  title: string
  body: string
  at: ISODateTime
  read: 0 | 1
  href: string | null
}

export interface AchievementUnlock {
  id: string
  unlockedAt: ISODateTime
}

export interface RoutineItem {
  id: ID
  label: string
}

export const WIDGET_IDS = [
  "hero",
  "briefing",
  "today",
  "radar",
  "habits",
  "focus",
  "schedule",
  "deadlines",
  "weekly",
  "xp",
  "insight",
] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export const RADAR_DIMS = [
  "productivity",
  "learning",
  "health",
  "finance",
  "growth",
  "consistency",
] as const
export type RadarDim = (typeof RADAR_DIMS)[number]

export const QUICK_ACTIONS = ["task", "capture", "habit", "block", "focus", "plan", "reflection"] as const
export type QuickActionId = (typeof QUICK_ACTIONS)[number]

export type ProductivityStyle = "classic" | "deep" | "flow" | "flexible"

export interface Prefs {
  id: "prefs"
  name: string
  onboarded: boolean
  dayStartMin: number
  dayEndMin: number
  weekStartsOn: 0 | 1
  focus: {
    focusMin: number
    shortBreakMin: number
    longBreakMin: number
    longEvery: number
    autoStartBreaks: boolean
    dailyTargetMin: number
  }
  routines: { morning: RoutineItem[]; evening: RoutineItem[] }
  widgets: { id: WidgetId; visible: boolean }[]
  radarDims: RadarDim[]
  quickActions: QuickActionId[]
  notifications: { browser: boolean; reminders: boolean; focus: boolean; achievements: boolean }
  weeklyTargets: { tasks: number; focusMin: number; habitRate: number }
  lifeGoals: string[]
  productivityStyle: ProductivityStyle
  focusAreas: Area[]
  studyInterests: string[]
  currency: string
  motion: "system" | "reduced"
  /** Look and feel: accent, roundness, glass, glow, size, font (see src/lib/design/design.ts). */
  design: Design
  /** Highest level already announced, so level-ups are celebrated once. */
  lastSeenLevel: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
