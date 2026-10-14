import type { ZodError } from "zod"
import { APP_TABLES, db } from "./db"
import { defaultPrefs, migratePrefs } from "./defaults"
import { addDays, daysBetween, todayISO } from "@/lib/domain/dates"
import { SERIES_AHEAD_DAYS, occurrenceId, seriesDates } from "@/lib/domain/series"
import { horizonRank } from "@/lib/domain/goals"
import { blockingTasks, completeTask, createsCycle, normalizeTag, reopenTask } from "@/lib/domain/tasks"
import type {
  ActivityEvent,
  AppNotification,
  Block,
  BlockSeries,
  FocusSession,
  Goal,
  GoalLog,
  GoalStatus,
  Habit,
  HabitLog,
  ID,
  ISODate,
  Prefs,
  Reflection,
  Task,
  TaskStatus,
  WeeklyReview,
} from "@/lib/domain/types"
import type { PlanSuggestion } from "@/lib/domain/planner"
import {
  blockInputSchema,
  blockSeriesInputSchema,
  fieldErrors,
  goalInputSchema,
  goalLogInputSchema,
  habitInputSchema,
  prefsSchema,
  reflectionInputSchema,
  taskInputSchema,
  type BlockInput,
  type BlockSeriesInput,
  type GoalInput,
  type HabitInput,
  type TaskInput,
} from "@/lib/validation/schemas"
import { uid } from "@/lib/utils"

/* ── errors ─────────────────────────────────────────── */

export class ValidationError extends Error {
  fields: Record<string, string>
  constructor(error: ZodError | Record<string, string>) {
    const fields = "issues" in error ? fieldErrors(error as ZodError) : (error as Record<string, string>)
    super(Object.values(fields)[0] ?? "Some fields need attention")
    this.name = "ValidationError"
    this.fields = fields
  }
}

export class BlockedError extends Error {
  blockers: Task[]
  constructor(blockers: Task[]) {
    super(`Finish "${blockers[0].title}" first${blockers.length > 1 ? ` (and ${blockers.length - 1} more)` : ""}`)
    this.name = "BlockedError"
    this.blockers = blockers
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no longer exists`)
    this.name = "NotFoundError"
  }
}

const nowISO = () => new Date().toISOString()

/* ── activity log (idempotent) ──────────────────────── */

async function logActivity(e: Omit<ActivityEvent, "id" | "at"> & { at?: string }) {
  const exists = await db.activity.where("dedupeKey").equals(e.dedupeKey).first()
  if (exists) return
  // the id comes from the dedupe key, so the same event logged on two devices is one event
  await db.activity.put({ id: `ev:${e.dedupeKey}`, at: e.at ?? nowISO(), ...e })
}

async function unlogActivity(dedupeKey: string) {
  await db.activity.where("dedupeKey").equals(dedupeKey).delete()
}

/* ── prefs ──────────────────────────────────────────── */

export async function ensurePrefs(): Promise<Prefs> {
  const saved = await db.prefs.get("prefs")
  if (!saved) {
    const fresh = defaultPrefs()
    await db.prefs.put(fresh)
    return fresh
  }
  const migrated = migratePrefs(saved)
  if (JSON.stringify(migrated) !== JSON.stringify(saved)) await db.prefs.put(migrated)
  return migrated
}

export async function updatePrefs(patch: Partial<Omit<Prefs, "id" | "createdAt">>): Promise<Prefs> {
  const current = await ensurePrefs()
  const next = { ...current, ...patch, updatedAt: nowISO() }
  const parsed = prefsSchema.safeParse(next)
  if (!parsed.success) throw new ValidationError(parsed.error)
  await db.prefs.put(next as Prefs)
  return next as Prefs
}

/* ── tasks ──────────────────────────────────────────── */

function cleanTags(tags: string[]) {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))]
}

export async function createTask(input: TaskInput, opts: { demo?: boolean } = {}): Promise<Task> {
  const parsed = taskInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  const data = parsed.data
  const stamp = nowISO()
  const first = await db.tasks.orderBy("order").first()
  const task: Task = {
    id: uid("t_"),
    ...data,
    tags: cleanTags(data.tags),
    dependsOn: [...new Set(data.dependsOn)],
    reminderFired: false,
    seriesId: null,
    nextId: null,
    order: (first?.order ?? 0) - 1,
    completedAt: data.status === "done" ? stamp : null,
    createdAt: stamp,
    updatedAt: stamp,
    ...(opts.demo ? { demo: true } : {}),
  }
  await db.transaction("rw", db.tasks, db.activity, async () => {
    await db.tasks.add(task)
    await logActivity({ type: "task.created", title: task.title, refId: task.id, area: task.area, dedupeKey: `task.created:${task.id}` })
  })
  return task
}

function editableFields(t: Task): TaskInput {
  return {
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    area: t.area,
    tags: t.tags,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    reminderAt: t.reminderAt,
    estimateMin: t.estimateMin,
    subtasks: t.subtasks,
    recurrence: t.recurrence,
    dependsOn: t.dependsOn,
    goalId: t.goalId ?? null,
  }
}

/** Saves edits. Status changes are routed through `setTaskStatus` so recurrence and dependencies are respected. */
export async function updateTask(id: ID, patch: Partial<TaskInput>): Promise<Task> {
  const current = await db.tasks.get(id)
  if (!current) throw new NotFoundError("This task")
  const parsed = taskInputSchema.safeParse({ ...editableFields(current), ...patch })
  if (!parsed.success) throw new ValidationError(parsed.error)
  const data = parsed.data

  const all = await db.tasks.toArray()
  const byId = new Map(all.map((t) => [t.id, t]))
  for (const dep of data.dependsOn) {
    if (createsCycle(id, dep, byId)) {
      throw new ValidationError({ dependsOn: `"${byId.get(dep)?.title ?? "That task"}" already depends on this one` })
    }
  }

  const { status, ...rest } = data
  const next: Task = {
    ...current,
    ...rest,
    tags: cleanTags(rest.tags),
    dependsOn: [...new Set(rest.dependsOn)],
    reminderFired: rest.reminderAt !== current.reminderAt ? false : current.reminderFired,
    updatedAt: nowISO(),
  }
  await db.tasks.put(next)
  if (status !== current.status) return (await setTaskStatus(id, status)) ?? next
  return next
}

export async function setTaskStatus(id: ID, status: TaskStatus): Promise<Task | null> {
  const task = await db.tasks.get(id)
  if (!task) throw new NotFoundError("This task")
  if (status === task.status) return task
  if (status === "done") return (await completeTaskById(id))?.completed ?? null
  if (task.status === "done") await reopenTaskById(id)
  const fresh = (await db.tasks.get(id))!
  const next = { ...fresh, status, updatedAt: nowISO() }
  await db.tasks.put(next)
  return next
}

export async function completeTaskById(id: ID, now = new Date()) {
  return db.transaction("rw", db.tasks, db.activity, async () => {
    const task = await db.tasks.get(id)
    if (!task) throw new NotFoundError("This task")
    if (task.status === "done") return null
    const all = await db.tasks.toArray()
    const blockers = blockingTasks(task, new Map(all.map((t) => [t.id, t])))
    if (blockers.length) throw new BlockedError(blockers)
    const result = completeTask(task, now, () => uid("t_"))
    await db.tasks.put(result.completed)
    if (result.next) await db.tasks.add(result.next)
    await logActivity({
      type: "task.completed",
      title: task.title,
      refId: id,
      area: task.area,
      dedupeKey: `task.completed:${id}`,
      at: result.completed.completedAt ?? undefined,
    })
    return result
  })
}

export async function reopenTaskById(id: ID, now = new Date()) {
  return db.transaction("rw", db.tasks, db.activity, async () => {
    const task = await db.tasks.get(id)
    if (!task || task.status !== "done") return null
    await db.tasks.put(reopenTask(task, now))
    // remove the next recurring instance if it was created by this completion and never touched
    if (task.nextId) {
      const spawned = await db.tasks.get(task.nextId)
      if (spawned && spawned.status !== "done" && spawned.updatedAt === spawned.createdAt) await db.tasks.delete(spawned.id)
    }
    await unlogActivity(`task.completed:${id}`)
    return true
  })
}

export async function toggleTaskDone(id: ID) {
  const task = await db.tasks.get(id)
  if (!task) throw new NotFoundError("This task")
  return task.status === "done" ? reopenTaskById(id) : completeTaskById(id)
}

export async function deleteTasks(ids: ID[]): Promise<Task[]> {
  return db.transaction("rw", db.tasks, async () => {
    const snapshot = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t)
    await db.tasks.bulkDelete(ids)
    return snapshot
  })
}

export async function restoreTasks(snapshot: Task[]) {
  await db.tasks.bulkPut(snapshot)
}

export async function duplicateTask(id: ID): Promise<Task> {
  const t = await db.tasks.get(id)
  if (!t) throw new NotFoundError("This task")
  const stamp = nowISO()
  const copy: Task = {
    ...t,
    id: uid("t_"),
    title: `${t.title} (copy)`.slice(0, 200),
    status: "todo",
    completedAt: null,
    reminderFired: false,
    seriesId: null,
    nextId: null,
    subtasks: t.subtasks.map((s) => ({ ...s, id: uid("s_"), done: false })),
    order: t.order + 0.5,
    createdAt: stamp,
    updatedAt: stamp,
    demo: undefined,
  }
  await db.tasks.add(copy)
  return copy
}

export async function reorderTasks(updates: { id: ID; order: number }[]) {
  await db.transaction("rw", db.tasks, async () => {
    for (const u of updates) await db.tasks.update(u.id, { order: u.order })
  })
}

export async function toggleSubtask(taskId: ID, subtaskId: ID) {
  const t = await db.tasks.get(taskId)
  if (!t) throw new NotFoundError("This task")
  const subtasks = t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s))
  await db.tasks.update(taskId, { subtasks, updatedAt: nowISO() })
}

export async function bulkUpdateTasks(ids: ID[], patch: { priority?: Task["priority"]; dueDate?: ISODate | null; area?: Task["area"] }) {
  await db.transaction("rw", db.tasks, async () => {
    for (const id of ids) await db.tasks.update(id, { ...patch, updatedAt: nowISO() })
  })
}

/** Applies a status to many tasks; returns the titles that couldn't be completed because they're blocked. */
export async function bulkSetStatus(ids: ID[], status: TaskStatus): Promise<string[]> {
  const blocked: string[] = []
  for (const id of ids) {
    try {
      await setTaskStatus(id, status)
    } catch (e) {
      if (e instanceof BlockedError) {
        const t = await db.tasks.get(id)
        if (t) blocked.push(t.title)
      } else throw e
    }
  }
  return blocked
}

export async function moveTasksToDate(ids: ID[], date: ISODate) {
  await bulkUpdateTasks(ids, { dueDate: date })
}

/* ── habits ─────────────────────────────────────────── */

export async function createHabit(input: HabitInput, opts: { demo?: boolean } = {}): Promise<Habit> {
  const parsed = habitInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  const stamp = nowISO()
  const last = await db.habits.orderBy("order").last()
  const habit: Habit = {
    id: uid("h_"),
    ...parsed.data,
    order: (last?.order ?? 0) + 1,
    archivedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...(opts.demo ? { demo: true } : {}),
  }
  await db.habits.add(habit)
  return habit
}

export async function updateHabit(id: ID, patch: Partial<HabitInput>): Promise<Habit> {
  const current = await db.habits.get(id)
  if (!current) throw new NotFoundError("This habit")
  const parsed = habitInputSchema.safeParse({
    name: current.name,
    icon: current.icon,
    color: current.color,
    area: current.area,
    schedule: current.schedule,
    timeOfDay: current.timeOfDay,
    startDate: current.startDate,
    ...patch,
  })
  if (!parsed.success) throw new ValidationError(parsed.error)
  const next: Habit = { ...current, ...parsed.data, updatedAt: nowISO() }
  await db.habits.put(next)
  return next
}

export async function setHabitArchived(id: ID, archived: boolean) {
  await db.habits.update(id, { archivedAt: archived ? nowISO() : null, updatedAt: nowISO() })
}

export interface HabitSnapshot {
  habit: Habit
  logs: HabitLog[]
}

export async function deleteHabit(id: ID): Promise<HabitSnapshot> {
  return db.transaction("rw", db.habits, db.habitLogs, async () => {
    const habit = await db.habits.get(id)
    if (!habit) throw new NotFoundError("This habit")
    const logs = await db.habitLogs.where("habitId").equals(id).toArray()
    await db.habitLogs.where("habitId").equals(id).delete()
    await db.habits.delete(id)
    return { habit, logs }
  })
}

export async function restoreHabit(snapshot: HabitSnapshot) {
  await db.transaction("rw", db.habits, db.habitLogs, async () => {
    await db.habits.put(snapshot.habit)
    await db.habitLogs.bulkPut(snapshot.logs)
  })
}

export async function reorderHabits(ids: ID[]) {
  await db.transaction("rw", db.habits, async () => {
    for (const [i, id] of ids.entries()) await db.habits.update(id, { order: i + 1 })
  })
}

/** Checks a habit in (or out) for a day. Future days are refused. Returns the new state. */
export async function toggleHabitLog(habitId: ID, date: ISODate): Promise<boolean> {
  if (daysBetween(todayISO(), date) > 0) throw new Error("You can't check in for a future day")
  const id = `${habitId}:${date}`
  return db.transaction("rw", db.habits, db.habitLogs, db.activity, async () => {
    const habit = await db.habits.get(habitId)
    if (!habit) throw new NotFoundError("This habit")
    if (await db.habitLogs.get(id)) {
      await db.habitLogs.delete(id)
      await unlogActivity(`habit:${id}`)
      return false
    }
    await db.habitLogs.add({ id, habitId, date, createdAt: nowISO() })
    await logActivity({ type: "habit.checked", title: habit.name, refId: habitId, area: habit.area, dedupeKey: `habit:${id}` })
    return true
  })
}

/* ── planner blocks ─────────────────────────────────── */

export async function createBlock(input: BlockInput): Promise<Block> {
  const parsed = blockInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  const stamp = nowISO()
  const block: Block = { id: uid("b_"), ...parsed.data, createdAt: stamp, updatedAt: stamp }
  await db.blocks.add(block)
  return block
}

export async function updateBlock(id: ID, patch: Partial<BlockInput>): Promise<Block> {
  const current = await db.blocks.get(id)
  if (!current) throw new NotFoundError("This block")
  const parsed = blockInputSchema.safeParse({
    date: current.date,
    start: current.start,
    end: current.end,
    title: current.title,
    kind: current.kind,
    taskId: current.taskId,
    notes: current.notes,
    source: current.source,
    ...patch,
  })
  if (!parsed.success) throw new ValidationError(parsed.error)
  const next: Block = { ...current, ...parsed.data, updatedAt: nowISO() }
  await db.blocks.put(next)
  return next
}

export async function deleteBlock(id: ID): Promise<Block | undefined> {
  const block = await db.blocks.get(id)
  await db.blocks.delete(id)
  return block
}

export async function restoreBlock(block: Block) {
  await db.blocks.put(block)
}

/* ── repeating blocks (see lib/domain/series.ts) ───── */

/** Starts a repeating block and puts its days on the timeline from `from` on. */
export async function createBlockSeries(input: BlockSeriesInput): Promise<BlockSeries> {
  const parsed = blockSeriesInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  const stamp = nowISO()
  const series: BlockSeries = { id: uid("bs_"), ...parsed.data, skip: [], createdAt: stamp, updatedAt: stamp }
  await db.blockSeries.add(series)
  await ensureSeriesBlocks(series.from, addDays(series.from, SERIES_AHEAD_DAYS), series.id)
  return series
}

/** Makes the blocks repeating series have between `from` and `to`, where they aren't there yet (or taken out). */
export async function ensureSeriesBlocks(from: ISODate, to: ISODate, onlySeriesId?: ID): Promise<number> {
  return db.transaction("rw", db.blocks, db.blockSeries, async () => {
    const one = onlySeriesId ? await db.blockSeries.get(onlySeriesId) : undefined
    const all = onlySeriesId ? (one ? [one] : []) : await db.blockSeries.toArray()
    const stamp = nowISO()
    const wanted: Block[] = []
    for (const s of all) {
      for (const date of seriesDates(s, from, to)) {
        wanted.push({ id: occurrenceId(s.id, date), date, start: s.start, end: s.end, title: s.title, kind: s.kind, taskId: null, notes: s.notes, source: "manual", seriesId: s.id, createdAt: stamp, updatedAt: stamp, ...(s.demo ? { demo: true } : {}) })
      }
    }
    if (!wanted.length) return 0
    const existing = await db.blocks.bulkGet(wanted.map((b) => b.id))
    const missing = wanted.filter((_, i) => !existing[i])
    if (missing.length) await db.blocks.bulkAdd(missing)
    return missing.length
  })
}

/** Takes one day out of its series (it won't come back) and removes its block. */
export async function skipSeriesDay(block: Block) {
  await db.transaction("rw", db.blocks, db.blockSeries, async () => {
    if (block.seriesId) {
      await db.blockSeries
        .where("id")
        .equals(block.seriesId)
        .modify((s) => {
          if (!s.skip.includes(block.date)) s.skip.push(block.date)
          s.updatedAt = nowISO()
        })
    }
    await db.blocks.delete(block.id)
  })
}

/** Puts a day taken out of its series back. */
export async function unskipSeriesDay(block: Block) {
  await db.transaction("rw", db.blocks, db.blockSeries, async () => {
    if (block.seriesId) {
      await db.blockSeries
        .where("id")
        .equals(block.seriesId)
        .modify((s) => {
          s.skip = s.skip.filter((d) => d !== block.date)
          s.updatedAt = nowISO()
        })
    }
    await db.blocks.put(block)
  })
}

/** Changes a series from `from` on: earlier days keep their blocks, later ones are made again from the new pattern. */
export async function updateSeriesFrom(seriesId: ID, patch: Partial<BlockSeriesInput>, from: ISODate): Promise<BlockSeries> {
  const current = await db.blockSeries.get(seriesId)
  if (!current) throw new NotFoundError("This repeating block")
  const parsed = blockSeriesInputSchema.safeParse({ title: current.title, kind: current.kind, start: current.start, end: current.end, notes: current.notes, days: current.days, from: current.from, until: current.until, ...patch })
  if (!parsed.success) throw new ValidationError(parsed.error)
  const next: BlockSeries = { ...current, ...parsed.data, updatedAt: nowISO() }
  await db.transaction("rw", db.blocks, db.blockSeries, async () => {
    await db.blockSeries.put(next)
    await db.blocks.where("seriesId").equals(seriesId).and((b) => b.date >= from).delete()
  })
  const today = todayISO()
  await ensureSeriesBlocks(from, addDays(from > today ? from : today, SERIES_AHEAD_DAYS), seriesId)
  return next
}

/** A series and its blocks from a day on, as they are now (for undoing endSeriesFrom). */
export async function seriesSnapshot(seriesId: ID, from: ISODate) {
  const series = await db.blockSeries.get(seriesId)
  const blocks = await db.blocks.where("seriesId").equals(seriesId).and((b) => b.date >= from).toArray()
  return series ? { series, blocks } : null
}

/** Puts back what seriesSnapshot saw. */
export async function restoreSeries(snapshot: { series: BlockSeries; blocks: Block[] }) {
  await db.transaction("rw", db.blocks, db.blockSeries, async () => {
    await db.blockSeries.put(snapshot.series)
    if (snapshot.blocks.length) await db.blocks.bulkPut(snapshot.blocks)
  })
}

/** Ends a series before `from`: its blocks from then on go, earlier ones stay. */
export async function endSeriesFrom(seriesId: ID, from: ISODate) {
  await db.transaction("rw", db.blocks, db.blockSeries, async () => {
    const s = await db.blockSeries.get(seriesId)
    if (!s) return
    const until = addDays(from, -1)
    if (until < s.from) await db.blockSeries.delete(seriesId)
    else await db.blockSeries.update(seriesId, { until, updatedAt: nowISO() })
    await db.blocks.where("seriesId").equals(seriesId).and((b) => b.date >= from).delete()
  })
}

/* ── weekly review ─────────────────────────────────── */

/**
 * Saves a week's review. The first time, each of next week's top three becomes a priority-1
 * task due on the last day of next week, tagged top3.
 */
export async function saveWeeklyReview(input: { weekStart: ISODate; wins: string; improve: string; top: string[] }): Promise<WeeklyReview> {
  const existing = await db.reviews.get(input.weekStart)
  const stamp = nowISO()
  let topTaskIds = existing?.topTaskIds ?? []
  if (!existing) {
    const due = addDays(input.weekStart, 13)
    for (const title of input.top.map((t) => t.trim()).filter(Boolean).slice(0, 3)) {
      const task = await createTask({ title, priority: 1, dueDate: due, tags: ["top3"] })
      topTaskIds = [...topTaskIds, task.id]
    }
  }
  const review: WeeklyReview = {
    id: input.weekStart,
    weekStart: input.weekStart,
    wins: input.wins.trim().slice(0, 4000),
    improve: input.improve.trim().slice(0, 4000),
    topTaskIds,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  }
  await db.reviews.put(review)
  return review
}

/** Adds accepted Plan-My-Day suggestions. Never touches existing blocks. */
export async function applyPlan(date: ISODate, suggestions: PlanSuggestion[]): Promise<Block[]> {
  const stamp = nowISO()
  const blocks: Block[] = suggestions.map((s) => ({
    id: uid("b_"),
    date,
    start: s.start,
    end: s.end,
    title: s.title.slice(0, 120),
    kind: s.kind,
    taskId: s.taskId,
    notes: s.reason.slice(0, 2000),
    source: "plan",
    createdAt: stamp,
    updatedAt: stamp,
  }))
  await db.transaction("rw", db.blocks, db.activity, async () => {
    await db.blocks.bulkAdd(blocks)
    await logActivity({
      type: "plan.applied",
      title: `Planned ${blocks.length} block${blocks.length === 1 ? "" : "s"}`,
      refId: null,
      area: null,
      dedupeKey: `plan:${date}:${stamp}`,
    })
  })
  return blocks
}

/* ── focus sessions ─────────────────────────────────── */

/** Idempotent: recording the same session id twice is a no-op. Returns whether it was newly saved. */
export async function recordFocusSession(session: FocusSession): Promise<boolean> {
  return db.transaction("rw", db.focusSessions, db.activity, db.tasks, async () => {
    if (await db.focusSessions.get(session.id)) return false
    await db.focusSessions.add(session)
    const task = session.taskId ? await db.tasks.get(session.taskId) : undefined
    const minutes = Math.round(session.actualSec / 60)
    await logActivity({
      type: session.completed ? "focus.completed" : "focus.stopped",
      title: `${minutes} min focus${task ? ` on ${task.title}` : ""}`,
      refId: session.id,
      area: session.area,
      dedupeKey: `focus:${session.id}`,
      at: session.endedAt,
    })
    return true
  })
}

export async function deleteFocusSession(id: ID) {
  await db.transaction("rw", db.focusSessions, db.activity, async () => {
    await db.focusSessions.delete(id)
    await unlogActivity(`focus:${id}`)
  })
}

/* ── reflections & routines ─────────────────────────── */

export async function saveReflection(date: ISODate, input: { mood: number; wins?: string; improve?: string }): Promise<Reflection> {
  const parsed = reflectionInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  const existing = await db.reflections.get(date)
  const stamp = nowISO()
  const reflection: Reflection = {
    id: date,
    date,
    ...parsed.data,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  }
  await db.transaction("rw", db.reflections, db.activity, async () => {
    await db.reflections.put(reflection)
    await logActivity({ type: "reflection.saved", title: "Daily reflection", refId: date, area: "mind", dedupeKey: `reflection:${date}` })
  })
  return reflection
}

export async function toggleRoutine(date: ISODate, itemId: ID): Promise<boolean> {
  const id = `${date}:${itemId}`
  if (await db.routineChecks.get(id)) {
    await db.routineChecks.delete(id)
    return false
  }
  await db.routineChecks.add({ id, date, itemId, createdAt: nowISO() })
  return true
}

/* ── goals ──────────────────────────────────────────── */

/** A parent must exist, have a longer horizon, and not be the goal itself or one of its descendants. */
async function checkParent(goalId: ID | null, horizon: Goal["horizon"], parentId: ID | null) {
  if (!parentId) return
  const all = await db.goals.toArray()
  const byId = new Map(all.map((g) => [g.id, g]))
  const parent = byId.get(parentId)
  if (!parent) throw new ValidationError({ parentId: "That goal no longer exists" })
  if (horizonRank(parent.horizon) <= horizonRank(horizon)) throw new ValidationError({ parentId: "A goal can only serve a goal with a longer horizon" })
  for (let p: Goal | undefined = parent; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
    if (p.id === goalId) throw new ValidationError({ parentId: "That would make the goal serve itself" })
  }
}

export async function createGoal(input: GoalInput, opts: { demo?: boolean } = {}): Promise<Goal> {
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  await checkParent(null, parsed.data.horizon, parsed.data.parentId)
  const stamp = nowISO()
  const last = await db.goals.orderBy("order").last()
  const goal: Goal = {
    id: uid("g_"),
    ...parsed.data,
    status: "active",
    completedAt: null,
    order: (last?.order ?? 0) + 1,
    createdAt: stamp,
    updatedAt: stamp,
    ...(opts.demo ? { demo: true } : {}),
  }
  await db.goals.add(goal)
  return goal
}

function goalFields(g: Goal): GoalInput {
  return { title: g.title, why: g.why, horizon: g.horizon, area: g.area, startDate: g.startDate, dueDate: g.dueDate, measure: g.measure, milestones: g.milestones, habitIds: g.habitIds, parentId: g.parentId }
}

export async function updateGoal(id: ID, patch: Partial<GoalInput>): Promise<Goal> {
  const current = await db.goals.get(id)
  if (!current) throw new NotFoundError("This goal")
  const parsed = goalInputSchema.safeParse({ ...goalFields(current), ...patch })
  if (!parsed.success) throw new ValidationError(parsed.error)
  await checkParent(id, parsed.data.horizon, parsed.data.parentId)
  const children = await db.goals.where("parentId").equals(id).toArray()
  if (children.some((c) => horizonRank(c.horizon) >= horizonRank(parsed.data.horizon))) {
    throw new ValidationError({ horizon: "Goals that serve this one need a shorter horizon than it" })
  }
  const next: Goal = { ...current, ...parsed.data, updatedAt: nowISO() }
  await db.goals.put(next)
  return next
}

/** Achieves, reopens or archives a goal. Achieving it logs it in your history (once). */
export async function setGoalStatus(id: ID, status: GoalStatus): Promise<Goal> {
  return db.transaction("rw", db.goals, db.activity, async () => {
    const goal = await db.goals.get(id)
    if (!goal) throw new NotFoundError("This goal")
    const stamp = nowISO()
    const next: Goal = { ...goal, status, completedAt: status === "done" ? (goal.completedAt ?? stamp) : null, updatedAt: stamp }
    await db.goals.put(next)
    if (status === "done") await logActivity({ type: "goal.completed", title: goal.title, refId: id, area: goal.area, dedupeKey: `goal:${id}` })
    else await unlogActivity(`goal:${id}`)
    return next
  })
}

export async function toggleMilestone(goalId: ID, milestoneId: ID): Promise<boolean> {
  return db.transaction("rw", db.goals, db.activity, async () => {
    const goal = await db.goals.get(goalId)
    if (!goal) throw new NotFoundError("This goal")
    const ms = goal.milestones.find((m) => m.id === milestoneId)
    if (!ms) throw new NotFoundError("This milestone")
    const done = !ms.doneAt
    const stamp = nowISO()
    await db.goals.put({ ...goal, milestones: goal.milestones.map((m) => (m.id === milestoneId ? { ...m, doneAt: done ? stamp : null } : m)), updatedAt: stamp })
    const key = `milestone:${goalId}:${milestoneId}`
    if (done) await logActivity({ type: "milestone.completed", title: `${ms.title} · ${goal.title}`, refId: goalId, area: goal.area, dedupeKey: key })
    else await unlogActivity(key)
    return done
  })
}

/** Records the value a number-target goal has reached on a day (one per day; the latest wins). */
export async function logGoalValue(goalId: ID, input: { date: ISODate; value: number; note?: string }): Promise<GoalLog> {
  const parsed = goalLogInputSchema.safeParse(input)
  if (!parsed.success) throw new ValidationError(parsed.error)
  if (daysBetween(todayISO(), parsed.data.date) > 0) throw new ValidationError({ date: "You can't log progress for a future day" })
  return db.transaction("rw", db.goals, db.goalLogs, db.activity, async () => {
    const goal = await db.goals.get(goalId)
    if (!goal) throw new NotFoundError("This goal")
    if (goal.measure.kind !== "target") throw new ValidationError({ value: "This goal isn't measured by a number" })
    const log: GoalLog = { id: `${goalId}:${parsed.data.date}`, goalId, ...parsed.data, createdAt: nowISO() }
    await db.goalLogs.put(log)
    const unit = goal.measure.unit ? ` ${goal.measure.unit}` : ""
    await unlogActivity(`goal.log:${log.id}`)
    await logActivity({ type: "goal.logged", title: `${goal.title}: ${log.value}${unit}`, refId: goalId, area: goal.area, dedupeKey: `goal.log:${log.id}` })
    return log
  })
}

export async function deleteGoalLog(id: string) {
  await db.transaction("rw", db.goalLogs, db.activity, async () => {
    await db.goalLogs.delete(id)
    await unlogActivity(`goal.log:${id}`)
  })
}

export interface GoalSnapshot {
  goal: Goal
  logs: GoalLog[]
  taskIds: ID[]
  childIds: ID[]
}

/** Deletes a goal and its logged values; linked tasks and sub-goals are kept but unlinked. Returns a snapshot for undo. */
export async function deleteGoal(id: ID): Promise<GoalSnapshot> {
  return db.transaction("rw", db.goals, db.goalLogs, db.tasks, db.activity, async () => {
    const goal = await db.goals.get(id)
    if (!goal) throw new NotFoundError("This goal")
    const logs = await db.goalLogs.where("goalId").equals(id).toArray()
    const taskIds = (await db.tasks.where("goalId").equals(id).primaryKeys()) as ID[]
    const childIds = (await db.goals.where("parentId").equals(id).primaryKeys()) as ID[]
    for (const t of taskIds) await db.tasks.update(t, { goalId: null })
    for (const c of childIds) await db.goals.update(c, { parentId: null })
    await db.goalLogs.where("goalId").equals(id).delete()
    await db.goals.delete(id)
    await unlogActivity(`goal:${id}`)
    return { goal, logs, taskIds, childIds }
  })
}

export async function restoreGoal(s: GoalSnapshot) {
  await db.transaction("rw", db.goals, db.goalLogs, db.tasks, async () => {
    await db.goals.put(s.goal)
    await db.goalLogs.bulkPut(s.logs)
    for (const t of s.taskIds) await db.tasks.update(t, { goalId: s.goal.id })
    for (const c of s.childIds) await db.goals.update(c, { parentId: s.goal.id })
  })
}

export async function reorderGoals(ids: ID[]) {
  await db.transaction("rw", db.goals, async () => {
    for (const [i, id] of ids.entries()) await db.goals.update(id, { order: i + 1 })
  })
}

/* ── notifications & achievements ───────────────────── */

export async function notify(n: Omit<AppNotification, "id" | "at" | "read" | "href"> & { href?: string | null }) {
  const item: AppNotification = { id: uid("n_"), at: nowISO(), read: 0, href: n.href ?? null, kind: n.kind, title: n.title, body: n.body }
  await db.notifications.add(item)
  return item
}

export async function markNotificationRead(id: ID) {
  await db.notifications.update(id, { read: 1 })
}

export async function markAllNotificationsRead() {
  await db.notifications.where("read").equals(0).modify({ read: 1 })
}

export async function clearNotifications() {
  await db.notifications.clear()
}

export async function recordUnlocks(ids: string[]) {
  const stamp = nowISO()
  await db.achievements.bulkPut(ids.map((id) => ({ id, unlockedAt: stamp })))
}

/** Marks reminders as fired; returns the tasks whose reminder just came due. */
export async function takeDueReminders(now = new Date()): Promise<Task[]> {
  return db.transaction("rw", db.tasks, async () => {
    const due = (await db.tasks.toArray()).filter(
      (t) => t.status !== "done" && t.reminderAt && !t.reminderFired && new Date(t.reminderAt).getTime() <= now.getTime(),
    )
    for (const t of due) await db.tasks.update(t.id, { reminderFired: true })
    return due
  })
}

/* ── everything ─────────────────────────────────────── */

export async function wipeAllData() {
  // only LIFE OS's own tables: with sync on, Dexie Cloud's bookkeeping lives in the same database
  const tables = APP_TABLES.map((t) => db.table(t))
  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear()
  })
}
