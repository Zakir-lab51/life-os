import Dexie, { type EntityTable } from "dexie"
import type {
  AchievementUnlock,
  ActivityEvent,
  AppNotification,
  Block,
  FocusSession,
  Habit,
  HabitLog,
  Prefs,
  Reflection,
  RoutineCheck,
  Task,
} from "@/lib/domain/types"

/**
 * Local-first storage. Everything lives in the browser's IndexedDB so LIFE OS
 * works with no account or server. The repository functions in `repo.ts` are
 * the only writers, which keeps a future sync layer to one seam.
 */
export class LifeDB extends Dexie {
  tasks!: EntityTable<Task, "id">
  habits!: EntityTable<Habit, "id">
  habitLogs!: EntityTable<HabitLog, "id">
  blocks!: EntityTable<Block, "id">
  focusSessions!: EntityTable<FocusSession, "id">
  reflections!: EntityTable<Reflection, "id">
  routineChecks!: EntityTable<RoutineCheck, "id">
  activity!: EntityTable<ActivityEvent, "id">
  notifications!: EntityTable<AppNotification, "id">
  achievements!: EntityTable<AchievementUnlock, "id">
  prefs!: EntityTable<Prefs, "id">

  constructor(name = "life-os") {
    super(name)
    this.version(1).stores({
      tasks: "id, status, dueDate, area, completedAt, order, seriesId, *tags",
      habits: "id, order, area",
      habitLogs: "id, habitId, date",
      blocks: "id, date, taskId",
      focusSessions: "id, date, startedAt, taskId",
      reflections: "id, date",
      routineChecks: "id, date",
      activity: "id, &dedupeKey, at, type",
      notifications: "id, at, read",
      achievements: "id",
      prefs: "id",
    })
  }
}

export const db = new LifeDB()

/** Tables included in backups (notifications are transient and left out). */
export const BACKUP_TABLES = [
  "prefs",
  "tasks",
  "habits",
  "habitLogs",
  "blocks",
  "focusSessions",
  "reflections",
  "routineChecks",
  "activity",
  "achievements",
] as const
