import Dexie, { type EntityTable } from "dexie"
import type {
  AchievementUnlock,
  ActivityEvent,
  AppNotification,
  Block,
  BlockSeries,
  FocusSession,
  Goal,
  GoalLog,
  Habit,
  HabitLog,
  Note,
  Prefs,
  Project,
  Reflection,
  RoutineCheck,
  Task,
  WeeklyReview,
} from "@/lib/domain/types"
import { CLOUD_DATABASE_URL, readSync } from "./cloud"

/**
 * Local-first storage. Everything lives in the browser's IndexedDB so LIFE OS
 * works with no account or server. The repository functions in `repo.ts` are
 * the only writers. With sync on (see `cloud.ts`) the same tables sync through
 * Dexie Cloud, in a separate local database.
 */
/** The Dexie Cloud addon. Only a device that syncs downloads it (it's about 130 KB). */
export type CloudAddon = (typeof import("dexie-cloud-addon"))["default"]

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
  blockSeries!: EntityTable<BlockSeries, "id">
  reviews!: EntityTable<WeeklyReview, "id">
  projects!: EntityTable<Project, "id">
  notes!: EntityTable<Note, "id">

  constructor(name = "life-os", cloud: CloudAddon | null = null) {
    super(name, cloud ? { addons: [cloud] } : {})
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
    if (cloud) {
      // a unique index can't hold across devices that are offline at once; events' ids carry their dedupe key instead
      this.version(3).stores({ activity: "id, dedupeKey, at, type" })
    }
    // repeating blocks and weekly reviews
    this.version(4).stores({
      blocks: "id, date, taskId, seriesId",
      blockSeries: "id",
      reviews: "id",
    })
    // projects, and a project link on tasks
    this.version(5).stores({
      tasks: "id, status, dueDate, area, completedAt, order, seriesId, *tags, goalId, projectId",
      projects: "id, status, order, goalId",
    })
    // the second brain: notes, found by folder, tag, journal day and the notes they link to
    this.version(6).stores({
      notes: "id, updatedAt, kind, date, folder, *tags, *links",
    })
    if (cloud) {
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

let instance: LifeDB | null = null
let addon: CloudAddon | null = null

/**
 * Gets the database ready to open: on a device that syncs, fetches the sync code first.
 * ClientGate waits for this before anything reads or writes.
 */
export async function initDatabase() {
  if (SYNCED && !addon) addon = (await import("dexie-cloud-addon")).default
}

function current(): LifeDB {
  if (!instance) {
    if (SYNCED && !addon) throw new Error("The synced database was used before initDatabase() finished")
    instance = new LifeDB("life-os", SYNCED ? addon : null)
  }
  return instance
}

/**
 * The app's database. It's made on first use rather than when this file loads, so a
 * device that doesn't sync never downloads the sync code; everything else uses it as
 * the database itself (its methods are bound to it).
 */
export const db: LifeDB = new Proxy({} as LifeDB, {
  get(_, key) {
    const d = current()
    const value = Reflect.get(d, key, d)
    return typeof value === "function" ? value.bind(d) : value
  },
  set: (_, key, value) => Reflect.set(current(), key, value),
  has: (_, key) => Reflect.has(current(), key),
})

/** This device's own data, from before sync was turned on (or while it's off). */
export const openOwnData = () => new LifeDB("life-os")

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
  "blockSeries",
  "reviews",
  "projects",
  "notes",
] as const

/** Every table that holds LIFE OS data (with sync on, the database also has Dexie Cloud's own tables, which must be left alone). */
export const APP_TABLES = [...BACKUP_TABLES, "notifications"] as const
