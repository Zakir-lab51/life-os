
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
  /** The goal this task moves forward, if any. */
  goalId?: ID | null
  /** The project this task belongs to, if any. */
  projectId?: ID | null
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
  /** Set when the block is one day of a repeating series. */
  seriesId?: ID | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

/** A repeating block: the pattern behind a timetable slot (see lib/domain/series.ts). */
export interface BlockSeries {
  id: ID
  title: string
  kind: BlockKind
  /** Minutes after midnight. */
  start: number
  end: number
  notes: string
  /** Weekdays it falls on, 0 = Sunday. */
  days: number[]
  /** First day, and last day (null: no end). */
  from: ISODate
  until: ISODate | null
  /** Days taken out one at a time. */
  skip: ISODate[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

/** One week's review: what went well, what to change, and next week's top three. Its id is the week's first day. */
export interface WeeklyReview {
  id: ISODate
  weekStart: ISODate
  wins: string
  improve: string
  /** Tasks made for next week's top three. */
  topTaskIds: ID[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
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
  | "goal.completed"
  | "milestone.completed"
  | "goal.logged"
  | "project.completed"
  | "project.milestone"

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

/* ── goals (Phase 2) ───────────────────────────────── */

/** Goal time horizons, shortest first. A goal can serve a parent with a longer horizon. */
export const GOAL_HORIZONS = ["week", "month", "quarter", "year", "five-year"] as const
export type GoalHorizon = (typeof GOAL_HORIZONS)[number]
export type GoalStatus = "active" | "done" | "archived"

export interface Milestone {
  id: ID
  title: string
  due: ISODate | null
  doneAt: ISODateTime | null
}

/**
 * How a goal's progress is measured:
 * - milestones: share of milestones reached
 * - tasks: share of linked tasks finished
 * - target: a number you log, from `start` towards `target` (e.g. 0 → 24 books)
 * - habit: check-ins of one habit since the goal started, out of `target`
 */
export type GoalMeasure =
  | { kind: "milestones" }
  | { kind: "tasks" }
  | { kind: "target"; unit: string; start: number; target: number }
  | { kind: "habit"; habitId: ID; target: number }

export interface Goal {
  id: ID
  title: string
  /** Why it matters; shown when you open the goal. */
  why: string
  horizon: GoalHorizon
  area: Area
  startDate: ISODate
  dueDate: ISODate | null
  measure: GoalMeasure
  milestones: Milestone[]
  /** Habits that support this goal (shown with it on the roadmap). */
  habitIds: ID[]
  /** The longer-horizon goal this one serves (Life Roadmap). */
  parentId: ID | null
  status: GoalStatus
  completedAt: ISODateTime | null
  order: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
}

/** A logged value for a number-target goal; one per goal per day (`${goalId}:${date}`). */
export interface GoalLog {
  id: string
  goalId: ID
  date: ISODate
  value: number
  note: string
  createdAt: ISODateTime
  demo?: boolean
}

/* ── projects (Phase 2) ────────────────────────────── */

/** Paused projects stay with the active ones, just set aside; done and archived ones are kept apart. */
export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** A link kept with a project: a doc, a folder, a reference. */
export interface ProjectLink {
  id: ID
  title: string
  url: string
}

/** Long-running work: its tasks (linked by `Task.projectId`), milestones, notes and links. */
export interface Project {
  id: ID
  name: string
  /** What done looks like; shown under the name. */
  description: string
  area: Area
  icon: string
  color: AccentColor
  status: ProjectStatus
  startDate: ISODate
  dueDate: ISODate | null
  milestones: Milestone[]
  /** The goal this project serves, if any. */
  goalId: ID | null
  /** Free-form notes kept with the project. */
  notes: string
  links: ProjectLink[]
  order: number
  completedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  demo?: boolean
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
  "goals",
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

export const QUICK_ACTIONS = ["task", "capture", "habit", "goal", "project", "block", "focus", "plan", "reflection"] as const
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
  /** Every quick action that existed when these prefs were last saved; ones added later start switched on, once. */
  seenQuickActions?: QuickActionId[]
  notifications: { browser: boolean; reminders: boolean; focus: boolean; achievements: boolean }
  weeklyTargets: { tasks: number; focusMin: number; habitRate: number }
  lifeGoals: string[]
  productivityStyle: ProductivityStyle
  focusAreas: Area[]
  /** No longer shown (the Study Hub was dropped); kept so older data and backups stay valid. */
  studyInterests: string[]
  currency: string
  motion: "system" | "reduced"
  /** Look and feel: accent, roundness, glass, glow, size, font (see src/lib/design/design.ts). */
  design: Design
  /** Highest level already announced, so level-ups are celebrated once. */
  lastSeenLevel: number
  /** Design defaults these prefs have been brought up to (see migratePrefs). */
  designVersion?: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
