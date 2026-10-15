import { db } from "./db"
import { addDays, fromISODate, toISODate, todayISO, weekday } from "@/lib/domain/dates"
import { defaultDueDate } from "@/lib/domain/goals"
import type { ActivityEvent, Area, Block, FocusSession, Goal, GoalLog, Habit, HabitLog, ISODate, Milestone, Project, Reflection, Task } from "@/lib/domain/types"
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
  return (await db.tasks.filter((t) => !!t.demo).count()) > 0 || (await db.habits.filter((h) => !!h.demo).count()) > 0 || (await db.goals.filter((g) => !!g.demo).count()) > 0
}

/**
 * Loads a clearly-labelled sample life: tasks, habits with ~9 weeks of
 * history, focus sessions, reflections, today's timeline, a small tree of
 * goals linked to those tasks and habits, and three projects. Every record
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

  /* goals: a five-year ambition with the yearly, quarterly, monthly and weekly goals that serve it */
  const goalTasks: Task[] = []
  const goals: Goal[] = []
  const goalLogs: GoalLog[] = []
  const ms = (title: string, due: number | null, doneOn?: number): Milestone => ({ id: uid("m_"), title, due: due === null ? null : addDays(T, due), doneAt: doneOn === undefined ? null : at(addDays(T, doneOn), 18 * 60) })
  const goal = (g: Pick<Goal, "title" | "why" | "horizon" | "area" | "startDate" | "dueDate" | "measure"> & Partial<Goal>): Goal => {
    const made: Goal = { id: uid("g_"), milestones: [], habitIds: [], parentId: null, status: "active", completedAt: null, order: goals.length + 1, createdAt: at(g.startDate, 9 * 60), updatedAt: stamp, demo: true, ...g }
    goals.push(made)
    return made
  }
  const doctor = goal({
    title: "Graduate as a confident doctor",
    why: "The reason for every late night: to be someone patients can trust.",
    horizon: "five-year",
    area: "study",
    startDate: addDays(T, -120),
    dueDate: addDays(T, 5 * 365 - 120),
    measure: { kind: "milestones" },
    milestones: [ms("Clear first-prof exams", -30, -30), ms("Clear second-prof exams", 420), ms("Final-year clinical postings", 1100), ms("Finish internship", 1600)],
  })
  goal({
    title: "Clear first-prof exams",
    why: "",
    horizon: "quarter",
    area: "study",
    startDate: addDays(T, -150),
    dueDate: addDays(T, -25),
    measure: { kind: "milestones" },
    milestones: [ms("Finish syllabus revision", -70, -70), ms("Complete 3 mock tests", -45, -44), ms("Sit the exams", -30, -30)],
    parentId: doctor.id,
    status: "done",
    completedAt: at(addDays(T, -30), 17 * 60),
  })
  const physio = goal({
    title: "Top the class in physiology",
    why: "Physiology is the base for everything clinical; getting it solid now saves years.",
    horizon: "year",
    area: "study",
    startDate: addDays(T, -60),
    dueDate: addDays(T, 305),
    measure: { kind: "tasks" },
    habitIds: [read.id],
    parentId: doctor.id,
  })
  for (const t of [tasks[0], readings, tasks[2]]) t.goalId = physio.id
  for (const [title, d] of [["Physiology MCQs set 1", -20], ["Physiology MCQs set 2", -12], ["Renal physiology summary", -5]] as const) {
    goalTasks.push(task({ title, area: "study", priority: 2, status: "done", dueDate: addDays(T, d), completedAt: at(addDays(T, d), 17 * 60), goalId: physio.id }))
  }
  goal({
    title: "Be viva-ready on the cardiac cycle",
    why: "",
    horizon: "week",
    area: "study",
    // a rolling week, so the milestones below always fit inside it
    startDate: addDays(T, -2),
    dueDate: addDays(T, 4),
    measure: { kind: "milestones" },
    milestones: [ms("Wiggers diagram", 0, -1), ms("Heart sounds & murmurs", 0), ms("Pressure–volume loop", 1), ms("Mock viva with a friend", 2)],
    parentId: physio.id,
  })
  const fit = goal({
    title: "Get properly fit",
    why: "More energy for long ward days.",
    horizon: "year",
    area: "health",
    startDate: addDays(T, -60),
    dueDate: addDays(T, 305),
    measure: { kind: "habit", habitId: workout.id, target: 160 },
    habitIds: [water.id],
  })
  const run = goal({
    title: "Run a 10K",
    why: "",
    horizon: "quarter",
    area: "health",
    startDate: addDays(T, -56),
    dueDate: addDays(T, 35),
    measure: { kind: "target", unit: "km", start: 3, target: 10 },
    habitIds: [workout.id],
    parentId: fit.id,
  })
  for (const [d, value] of [[-49, 3.5], [-40, 4], [-32, 5], [-24, 5.5], [-15, 6.5], [-6, 7.2]] as const) {
    const date = addDays(T, d)
    goalLogs.push({ id: `${run.id}:${date}`, goalId: run.id, date, value, note: "", createdAt: at(date, 7 * 60), demo: true })
  }
  const monthStart = toISODate(new Date(fromISODate(T).getFullYear(), fromISODate(T).getMonth(), 1))
  goal({
    title: "Meditate 25 days this month",
    why: "",
    horizon: "month",
    area: "mind",
    startDate: monthStart,
    dueDate: defaultDueDate("month", monthStart, 1),
    measure: { kind: "habit", habitId: meditate.id, target: 25 },
  })
  const fund = goal({
    title: "Build an emergency fund",
    why: "So a surprise bill never derails a semester.",
    horizon: "year",
    area: "finance",
    startDate: addDays(T, -60),
    dueDate: addDays(T, 305),
    measure: { kind: "target", unit: "rupees", start: 0, target: 30000 },
    habitIds: [spend.id],
  })
  for (const [d, value] of [[-55, 4000], [-40, 7000], [-26, 9500], [-10, 12500]] as const) {
    const date = addDays(T, d)
    goalLogs.push({ id: `${fund.id}:${date}`, goalId: fund.id, date, value, note: "", createdAt: at(date, 20 * 60), demo: true })
  }
  const internship = goal({
    title: "Land a research internship",
    why: "",
    horizon: "quarter",
    area: "work",
    startDate: addDays(T, -45),
    dueDate: addDays(T, 45),
    measure: { kind: "milestones" },
    milestones: [ms("Shortlist 5 labs", -10), ms("Update CV", 6), ms("Send 3 applications", 30)],
  })
  const cv = tasks.find((t) => t.title === "Update CV with internship")
  if (cv) cv.goalId = internship.id
  tasks.push(...goalTasks)

  /* projects: one under way (serving the internship goal), one small and personal, one finished */
  const projects: Project[] = []
  const project = (p: Pick<Project, "name" | "description" | "area" | "icon" | "color" | "startDate" | "dueDate"> & Partial<Project>): Project => {
    const made: Project = { id: uid("pr_"), status: "active", milestones: [], goalId: null, notes: "", links: [], order: projects.length + 1, completedAt: null, createdAt: at(p.startDate, 9 * 60), updatedAt: stamp, demo: true, ...p }
    projects.push(made)
    return made
  }
  const done = (title: string, d: number, area: Area, projectId: string) =>
    task({ title, area, priority: 2, status: "done", dueDate: addDays(T, d), completedAt: at(addDays(T, d), 17 * 60), createdAt: at(addDays(T, d - 3), 9 * 60), updatedAt: at(addDays(T, d), 17 * 60), projectId })
  const poster = project({
    name: "Research poster: ECG in athletes",
    description: "A poster for the college research day on how training changes the resting ECG.",
    area: "study",
    icon: "HeartPulse",
    color: "rose",
    startDate: addDays(T, -20),
    dueDate: addDays(T, 21),
    goalId: internship.id,
    milestones: [ms("Research question approved", -10, -10), ms("20 ECGs collected", 5), ms("Poster submitted", 20)],
    notes: "Supervisor: Dr. Rao (Physiology), free after 4 pm on Thursdays.\nAim for 20 ECGs from the sports-quota students; 12 is the minimum for the abstract.\nMeasure QTc with Bazett's formula and note any early repolarisation.",
    links: [{ id: uid("l_"), title: "PubMed: athlete's heart ECG", url: "https://pubmed.ncbi.nlm.nih.gov/?term=athlete%27s+heart+ECG" }],
  })
  const collect = task({ title: "Record ECGs from sports-quota students", area: "study", priority: 2, status: "in_progress", dueDate: addDays(T, 3), estimateMin: 90, projectId: poster.id, createdAt: at(addDays(T, -9), 10 * 60) })
  tasks.push(
    done("Literature search on athlete's heart", -18, "study", poster.id),
    done("Draft the research question", -12, "study", poster.id),
    done("Meet Dr. Rao about the poster", -6, "study", poster.id),
    collect,
    task({ title: "Measure QT intervals", area: "study", priority: 2, dueDate: addDays(T, 8), estimateMin: 60, projectId: poster.id, createdAt: at(addDays(T, -9), 10 * 60) }),
    task({ title: "Design the poster layout", area: "study", priority: 3, dueDate: addDays(T, 13), estimateMin: 90, projectId: poster.id, createdAt: at(addDays(T, -4), 19 * 60) }),
    task({ title: "Print the poster", area: "study", priority: 3, dueDate: addDays(T, 19), estimateMin: 30, projectId: poster.id, createdAt: at(addDays(T, -4), 19 * 60) }),
  )
  for (const d of [-3, -1]) {
    const day = addDays(T, d)
    sessions.push({ id: uid("f_"), mode: "pomodoro", date: day, startedAt: at(day, 16 * 60), endedAt: at(day, 16 * 60 + 50), plannedSec: 3000, actualSec: 3000, taskId: collect.id, area: "study", completed: true, demo: true })
  }
  const room = project({ name: "Hostel room makeover", description: "A desk that makes studying the easy choice.", area: "personal", icon: "House", color: "amber", startDate: addDays(T, -8), dueDate: addDays(T, 10) })
  tasks.push(
    done("Measure the desk space", -6, "personal", room.id),
    task({ title: "Buy a desk lamp", area: "personal", priority: 3, dueDate: addDays(T, 2), estimateMin: 30, projectId: room.id, createdAt: at(addDays(T, -6), 20 * 60) }),
    task({ title: "Put up the anatomy charts", area: "personal", priority: 4, dueDate: addDays(T, 5), estimateMin: 20, projectId: room.id, createdAt: at(addDays(T, -6), 20 * 60) }),
    task({ title: "Sort out the cable mess", area: "personal", priority: 4, estimateMin: 20, projectId: room.id, createdAt: at(addDays(T, -6), 20 * 60) }),
  )
  const seminar = project({
    name: "Renal physiology seminar",
    description: "A 15-minute seminar for the batch.",
    area: "study",
    icon: "Presentation",
    color: "cyan",
    startDate: addDays(T, -35),
    dueDate: addDays(T, -14),
    status: "done",
    completedAt: at(addDays(T, -14), 18 * 60),
    milestones: [ms("Slides ready", -16, -17), ms("Seminar given", -14, -14)],
  })
  tasks.push(done("Outline the seminar", -30, "study", seminar.id), done("Make the slides", -17, "study", seminar.id), done("Rehearse with a timer", -15, "study", seminar.id))

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
    ...goals.flatMap((g) =>
      g.milestones
        .filter((m) => m.doneAt)
        .map((m) => ({ id: uid("ev_"), type: "milestone.completed" as const, at: m.doneAt!, title: `${m.title} · ${g.title}`, refId: g.id, area: g.area, dedupeKey: `milestone:${g.id}:${m.id}`, demo: true })),
    ),
    ...goals.filter((g) => g.completedAt).map((g) => ({ id: uid("ev_"), type: "goal.completed" as const, at: g.completedAt!, title: g.title, refId: g.id, area: g.area, dedupeKey: `goal:${g.id}`, demo: true })),
    ...projects.flatMap((p) =>
      p.milestones
        .filter((m) => m.doneAt)
        .map((m) => ({ id: uid("ev_"), type: "project.milestone" as const, at: m.doneAt!, title: `${m.title} · ${p.name}`, refId: p.id, area: p.area, dedupeKey: `pmilestone:${p.id}:${m.id}`, demo: true })),
    ),
    ...projects.filter((p) => p.completedAt).map((p) => ({ id: uid("ev_"), type: "project.completed" as const, at: p.completedAt!, title: p.name, refId: p.id, area: p.area, dedupeKey: `project:${p.id}`, demo: true })),
    ...goalLogs.map((l) => {
      const g = goals.find((x) => x.id === l.goalId)!
      const unit = g.measure.kind === "target" && g.measure.unit ? ` ${g.measure.unit}` : ""
      return { id: uid("ev_"), type: "goal.logged" as const, at: l.createdAt, title: `${g.title}: ${l.value}${unit}`, refId: g.id, area: g.area, dedupeKey: `goal.log:${l.id}`, demo: true }
    }),
  ]

  await db.transaction("rw", [db.tasks, db.habits, db.habitLogs, db.focusSessions, db.reflections, db.blocks, db.goals, db.goalLogs, db.projects, db.activity], async () => {
    await db.tasks.bulkAdd(tasks)
    // demo goals and projects sit after the user's own in their lists
    const lastOrder = (await db.goals.orderBy("order").last())?.order ?? 0
    await db.goals.bulkAdd(goals.map((g) => ({ ...g, order: g.order + lastOrder })))
    const lastProject = (await db.projects.orderBy("order").last())?.order ?? 0
    await db.projects.bulkAdd(projects.map((p) => ({ ...p, order: p.order + lastProject })))
    await db.goalLogs.bulkPut(goalLogs)
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
  await db.transaction("rw", [db.tasks, db.habits, db.habitLogs, db.focusSessions, db.reflections, db.blocks, db.goals, db.goalLogs, db.projects, db.activity, db.routineChecks], async () => {
    const demoHabitIds = (await db.habits.filter((h) => !!h.demo).primaryKeys()) as string[]
    const demoGoalIds = (await db.goals.filter((g) => !!g.demo).primaryKeys()) as string[]
    const demoProjectIds = (await db.projects.filter((p) => !!p.demo).primaryKeys()) as string[]
    await db.tasks.filter((t) => !!t.demo).delete()
    // the user's own tasks, goals and projects may point at demo ones: keep them, just unlink
    await db.tasks.filter((t) => !!t.goalId && demoGoalIds.includes(t.goalId)).modify({ goalId: null })
    await db.tasks.filter((t) => !!t.projectId && demoProjectIds.includes(t.projectId)).modify({ projectId: null })
    await db.projects.filter((p) => !p.demo && !!p.goalId && demoGoalIds.includes(p.goalId)).modify({ goalId: null })
    await db.projects.bulkDelete(demoProjectIds)
    await db.goals.filter((g) => !g.demo && !!g.parentId && demoGoalIds.includes(g.parentId)).modify({ parentId: null })
    await db.goals.filter((g) => !g.demo).modify((g) => {
      g.habitIds = g.habitIds.filter((id) => !demoHabitIds.includes(id))
    })
    await db.goals.bulkDelete(demoGoalIds)
    await db.goalLogs.filter((l) => !!l.demo || demoGoalIds.includes(l.goalId)).delete()
    await db.habits.bulkDelete(demoHabitIds)
    await db.habitLogs.filter((l) => !!l.demo || demoHabitIds.includes(l.habitId)).delete()
    await db.focusSessions.filter((s) => !!s.demo).delete()
    await db.reflections.filter((r) => !!r.demo).delete()
    await db.blocks.filter((b) => !!b.demo).delete()
    await db.activity.filter((e) => !!e.demo).delete()
    await db.routineChecks.filter((c) => !!c.demo).delete()
  })
}
