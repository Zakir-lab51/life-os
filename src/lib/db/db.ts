import Dexie, { type EntityTable } from "dexie"
import dexieCloud from "dexie-cloud-addon"
import type {
  AchievementUnlock,
  ActivityEvent,
  AppNotification,
  Block,
  FocusSession,
  Goal,
  GoalLog,
  Habit,
  HabitLog,
  Prefs,
  Reflection,
  RoutineCheck,
  Task,
} from "@/lib/domain/types"
import { CLOUD_DATABASE_URL, readSync } from "./cloud"

/**
 * Local-first storage. Everything lives in the browser's IndexedDB so LIFE OS
 * works with no account or server. The repository functions in `repo.ts` are
 * the only writers. With sync on (see `cloud.ts`) the same tables sync through
 * Dexie Cloud, in a separate local database.
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
  goals!: EntityTable<Goal, "id">
  goalLogs!: EntityTable<GoalLog, "id">

  constructor(name = "life-os", synced = false) {
    super(name, synced ? { addons: [dexieCloud] } : {})
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
    // Phase 2: goals, their logged values, and a goal link on tasks
    this.version(2).stores({
      tasks: "id, status, dueDate, area, completedAt, order, seriesId, *tags, goalId",
      goals: "id, status, horizon, parentId, order",
      goalLogs: "id, goalId, date",
    })
    if (synced) {
      // a unique index can't hold across devices that are offline at once; events' ids carry their dedupe key instead
      this.version(3).stores({ activity: "id, dedupeKey, at, type" })
      this.cloud.configure({
        databaseUrl: CLOUD_DATABASE_URL,
        requireAuth: false,
        customLoginGui: true,
        // reminders are made on each device
        unsyncedTables: ["notifications"],
      })
    }
  }
}

/** Whether this device syncs (decided once, at load: turning sync on or off reloads the app). */
export const SYNCED = typeof window !== "undefined" && CLOUD_DATABASE_URL !== "" && readSync() !== null

export const db = new LifeDB("life-os", SYNCED)

/** This device's own data, from before sync was turned on (or while it's off). */
export const openOwnData = () => new LifeDB("life-os", false)

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
  "goals",
  "goalLogs",
] as const
