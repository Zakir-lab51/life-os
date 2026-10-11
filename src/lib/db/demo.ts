import { db } from "./db"
import { addDays, fromISODate, todayISO, weekday } from "@/lib/domain/dates"
import type { ActivityEvent, Area, Block, FocusSession, Habit, HabitLog, ISODate, Reflection, Task } from "@/lib/domain/types"
import { uid } from "@/lib/utils"

/** Deterministic PRNG so the demo looks the same every time it's loaded. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const at = (date: ISODate, minutes: number) => new Date(fromISODate(date).getTime() + minutes * 60_000).toISOString()

export async function hasDemoData() {
  return (await db.tasks.filter((t) => !!t.demo).count()) > 0 || (await db.habits.filter((h) => !!h.demo).count()) > 0
}

/**
 * Loads a clearly-labelled sample life: tasks, habits with ~9 weeks of
 * history, focus sessions, reflections and today's timeline. Every record
 * carries `demo: true` so "Remove demo data" can delete exactly these.
 */
export async function seedDemo(now = new Date()) {
  const T = todayISO(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const rand = mulberry32(51)
  const stamp = now.toISOString()
  const base = { notes: "", tags: [] as string[], dueTime: null, reminderAt: null, reminderFired: false, subtasks: [], recurrence: null, seriesId: null, nextId: null, dependsOn: [] as string[], completedAt: null, demo: true }

  /* tasks */
  let order = -100
  const task = (t: Partial<Task> & Pick<Task, "title" | "area" | "priority">): Task => ({
    id: uid("t_"),
    status: "todo",
    dueDate: null,
    estimateMin: 30,
    order: order++,
    createdAt: at(addDays(T, -10), 9 * 60),
    updatedAt: at(addDays(T, -10), 9 * 60),
    ...base,
    ...t,
  })

  const readings = task({ title: "Collect practical readings", area: "study", priority: 2, dueDate: addDays(T, -2), estimateMin: 20, tags: ["lab"] })
  const tasks: Task[] = [
    task({
      title: "Revise cardiac cycle for viva",
      area: "study",
      priority: 1,
      dueDate: T,
      estimateMin: 60,
      tags: ["exam"],
      subtasks: [
        { id: uid("s_"), title: "Wiggers diagram", done: true },
        { id: uid("s_"), title: "Heart sounds & murmurs", done: false },
        { id: uid("s_"), title: "Pressure–volume loop", done: false },
      ],
    }),
    readings,
    task({ title: "Write up practical record", area: "study", priority: 2, dueDate: addDays(T, 1), estimateMin: 45, dependsOn: [readings.id], tags: ["lab"] }),
    task({ title: "Pay hostel mess fees", area: "finance", priority: 1, dueDate: T, estimateMin: 10 }),
    task({ title: "Call home", area: "personal", priority: 3, dueDate: T, estimateMin: 15, tags: ["family"] }),
    task({ title: "Daily review", area: "mind", priority: 3, dueDate: T, estimateMin: 10, recurrence: { freq: "daily", interval: 1 } }),
    task({ title: "Plan weekly study timetable", area: "study", priority: 3, dueDate: addDays(T, 2), estimateMin: 30 }),
    task({ title: "Gym: leg day", area: "health", priority: 3, dueDate: addDays(T, 1), estimateMin: 60 }),
    task({
      title: "Review monthly budget",
      area: "finance",
      priority: 2,
      dueDate: addDays(T, 3),
      estimateMin: 30,
      recurrence: { freq: "monthly", interval: 1 },
      reminderAt: at(addDays(T, 3), 9 * 60),
    }),
    task({ title: "Book dentist appointment", area: "health", priority: 2, dueDate: addDays(T, 4), estimateMin: 10 }),
    task({ title: "Update CV with internship", area: "work", priority: 3, dueDate: addDays(T, 6), estimateMin: 90, tags: ["career"] }),
    task({ title: "Read 'Atomic Habits' chapter 4", area: "personal", priority: 4, estimateMin: 30, tags: ["reading"] }),
    task({
      title: "Organise anatomy notes folder",
      area: "study",
      priority: 4,
      status: "in_progress",
      estimateMin: 25,
      subtasks: [
        { id: uid("s_"), title: "Upper limb", done: true },
        { id: uid("s_"), title: "Lower limb", done: false },
        { id: uid("s_"), title: "Thorax", done: false },
      ],
    }),
  ]

  // finished work over the last four weeks (heavier on Tuesdays and Wednesdays)
  const donePool: [string, Area, Task["priority"]][] = [
    ["Revise brachial plexus", "study", 2], ["Finish biochem worksheet", "study", 2], ["Grocery run", "personal", 4],
    ["Laundry", "personal", 4], ["Histology slides practice", "study", 2], ["Email project mentor", "work", 3],
    ["Pay phone bill", "finance", 2], ["30-min run", "health", 3], ["Physiology MCQs set 3", "study", 2],
    ["Clean desk", "personal", 4], ["Prepare seminar slides", "study", 1], ["Weekly review", "mind", 3],
    ["Update expense log", "finance", 3], ["Call grandparents", "personal", 3], ["Microbiology flashcards", "study", 3],
  ]
  for (let d = 27; d >= 1; d--) {
    const day = addDays(T, -d)
    const wd = weekday(day)
    const count = (wd === 2 || wd === 3 ? 2 : 0) + (rand() < 0.55 ? 1 : 0) + (rand() < 0.25 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const [title, area, priority] = donePool[Math.floor(rand() * donePool.length)]
      const minute = 8 * 60 + Math.floor(rand() * 13 * 60)
      tasks.push(
        task({ title, area, priority, status: "done", dueDate: day, estimateMin: 30, completedAt: at(day, minute), createdAt: at(addDays(day, -2), 9 * 60), updatedAt: at(day, minute) }),
      )
    }
  }

  /* habits with history */
  const start = addDays(T, -63)
  const habit = (h: Pick<Habit, "name" | "icon" | "color" | "area" | "schedule" | "timeOfDay">, i: number): Habit => ({
    id: uid("h_"),
    startDate: start,
    order: i + 1,
    archivedAt: null,
    createdAt: at(start, 8 * 60),
    updatedAt: at(start, 8 * 60),
    demo: true,
    ...h,
  })
  const workout = habit({ name: "Workout", icon: "Dumbbell", color: "mint", area: "health", schedule: { kind: "weekly", times: 4 }, timeOfDay: "morning" }, 0)
  const meditate = habit({ name: "Meditate 10 minutes", icon: "Leaf", color: "cyan", area: "mind", schedule: { kind: "daily" }, timeOfDay: "morning" }, 1)
  const read = habit({ name: "Read 20 pages", icon: "BookOpen", color: "violet", area: "study", schedule: { kind: "daily" }, timeOfDay: "evening" }, 2)
  const water = habit({ name: "Drink 2L water", icon: "Droplets", color: "blue", area: "health", schedule: { kind: "daily" }, timeOfDay: "anytime" }, 3)
  const spend = habit({ name: "Review spending", icon: "Wallet", color: "amber", area: "finance", schedule: { kind: "weekdays", days: [0] }, timeOfDay: "evening" }, 4)
  const habits = [workout, meditate, read, water, spend]

  const logs: HabitLog[] = []
  const log = (h: Habit, day: ISODate) => logs.push({ id: `${h.id}:${day}`, habitId: h.id, date: day, createdAt: at(day, 9 * 60), demo: true })
  for (let d = 63; d >= 1; d--) {
    const day = addDays(T, -d)
    const wd = weekday(day)
    if (wd !== 0 && wd !== 6 && rand() < 0.72) log(workout, day)
    if (d <= 11 || rand() < 0.6) log(meditate, day)
    if (rand() < 0.74) log(read, day)
    if (rand() < 0.86) log(water, day)
    if (wd === 0 && rand() < 0.75) log(spend, day)
  }
  log(water, T)

  /* focus sessions */
  const sessions: FocusSession[] = []
  for (let d = 20; d >= 0; d--) {
    const day = addDays(T, -d)
    const n = d === 0 ? (nowMin > 11 * 60 ? 1 : 0) : rand() < 0.15 ? 0 : 1 + Math.floor(rand() * 3)
    let minute = d === 0 ? 9 * 60 + 30 : 9 * 60 + Math.floor(rand() * 120)
    for (let i = 0; i < n; i++) {
      const planned = rand() < 0.6 ? 25 : 50
      const stopped = rand() < 0.1
      const actual = stopped ? Math.round(planned * 0.6) : planned
      const area: Area = rand() < 0.7 ? "study" : "work"
      const studyTask = tasks.find((t) => t.area === area && t.status !== "done")
      sessions.push({
        id: uid("f_"),
        mode: "pomodoro",
        date: day,
        startedAt: at(day, minute),
        endedAt: at(day, minute + actual),
        plannedSec: planned * 60,
        actualSec: actual * 60,
        taskId: rand() < 0.5 ? (studyTask?.id ?? null) : null,
        area,
        completed: !stopped,
        demo: true,
      })
      minute += actual + 15 + Math.floor(rand() * 90)
    }
  }

  /* reflections */
  const reflections: Reflection[] = []
  const wins = ["Finished the biochem worksheet early", "Kept my phone away during study blocks", "Good workout, felt energised", "Explained the cardiac cycle to a friend", "Stuck to the plan until lunch"]
  const improve = ["Start the hardest task before noon", "Sleep before midnight", "Fewer tabs open while studying", "Take real breaks, not phone breaks", "Prepare tomorrow's list tonight"]
  for (let d = 6; d >= 1; d--) {
    if (d === 4) continue
    const day = addDays(T, -d)
    reflections.push({
      id: day,
      date: day,
      mood: (3 + Math.floor(rand() * 3)) as Reflection["mood"],
      wins: wins[d % wins.length],
      improve: improve[d % improve.length],
      createdAt: at(day, 21 * 60 + 30),
      updatedAt: at(day, 21 * 60 + 30),
      demo: true,
    })
  }

  /* today's timeline */
  const block = (b: Pick<Block, "date" | "start" | "end" | "title" | "kind"> & Partial<Block>): Block => ({
    id: uid("b_"),
    taskId: null,
    notes: "",
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
    demo: true,
    ...b,
  })
  const blocks: Block[] = [
    block({ date: T, start: 10 * 60, end: 11 * 60, title: "Physiology lecture", kind: "event" }),
    block({ date: T, start: 13 * 60, end: 13 * 60 + 45, title: "Lunch", kind: "break" }),
    block({ date: T, start: 18 * 60, end: 19 * 60, title: "Gym", kind: "event" }),
    block({ date: addDays(T, 1), start: 9 * 60, end: 12 * 60, title: "Anatomy dissection", kind: "event" }),
  ]

  /* history feed, derived from the records above */
  const activity: ActivityEvent[] = [
    ...tasks
      .filter((t) => t.status === "done")
      .map((t) => ({ id: uid("ev_"), type: "task.completed" as const, at: t.completedAt!, title: t.title, refId: t.id, area: t.area, dedupeKey: `task.completed:${t.id}`, demo: true })),
    ...logs.map((l) => {
      const h = habits.find((x) => x.id === l.habitId)!
      return { id: uid("ev_"), type: "habit.checked" as const, at: l.createdAt, title: h.name, refId: h.id, area: h.area, dedupeKey: `habit:${l.id}`, demo: true }
    }),
    ...sessions.map((s) => ({
      id: uid("ev_"),
      type: s.completed ? ("focus.completed" as const) : ("focus.stopped" as const),
      at: s.endedAt,
      title: `${Math.round(s.actualSec / 60)} min focus`,
      refId: s.id,
      area: s.area,
      dedupeKey: `focus:${s.id}`,
      demo: true,
    })),
    ...reflections.map((r) => ({ id: uid("ev_"), type: "reflection.saved" as const, at: r.createdAt, title: "Daily reflection", refId: r.id, area: "mind" as const, dedupeKey: `reflection:${r.id}`, demo: true })),
  ]

  await db.transaction("rw", [db.tasks, db.habits, db.habitLogs, db.focusSessions, db.reflections, db.blocks, db.activity], async () => {
    await db.tasks.bulkAdd(tasks)
    await db.habits.bulkAdd(habits)
    await db.habitLogs.bulkPut(logs)
    await db.focusSessions.bulkAdd(sessions)
    // never overwrite a real reflection the user already wrote for one of these days
    for (const r of reflections) if (!(await db.reflections.get(r.id))) await db.reflections.add(r)
    await db.blocks.bulkAdd(blocks)
    for (const e of activity) if (!(await db.activity.where("dedupeKey").equals(e.dedupeKey).first())) await db.activity.add(e)
  })
}

/** Deletes every record created by `seedDemo`, leaving the user's own data untouched. */
export async function removeDemo() {
  await db.transaction("rw", [db.tasks, db.habits, db.habitLogs, db.focusSessions, db.reflections, db.blocks, db.activity, db.routineChecks], async () => {
    const demoHabitIds = (await db.habits.filter((h) => !!h.demo).primaryKeys()) as string[]
    await db.tasks.filter((t) => !!t.demo).delete()
    await db.habits.bulkDelete(demoHabitIds)
    await db.habitLogs.filter((l) => !!l.demo || demoHabitIds.includes(l.habitId)).delete()
    await db.focusSessions.filter((s) => !!s.demo).delete()
    await db.reflections.filter((r) => !!r.demo).delete()
    await db.blocks.filter((b) => !!b.demo).delete()
    await db.activity.filter((e) => !!e.demo).delete()
    await db.routineChecks.filter((c) => !!c.demo).delete()
  })
}
