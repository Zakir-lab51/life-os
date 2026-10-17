import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db/db"
import { exportBackup, restoreBackup } from "@/lib/db/backup"
import { parseBackup } from "@/lib/db/backup-file"
import { removeDemo, seedDemo } from "@/lib/db/demo"
import {
  ValidationError,
  completeTaskById,
  createGoal,
  createProject,
  createTask,
  deleteGoal,
  deleteProject,
  moveTasksToProject,
  restoreGoal,
  restoreProject,
  setProjectStatus,
  toggleProjectMilestone,
  updateProject,
  updateTask,
  wipeAllData,
} from "@/lib/db/repo"
import { todayISO } from "@/lib/domain/dates"
import { compareProjects, lastMoved, nameFromTag, nextUp, projectDueText, projectFocusMinutes, projectHealth, projectProgress, projectTimeline, tagCandidates } from "@/lib/domain/projects"
import type { Project } from "@/lib/domain/types"
import { makeSession, makeTask } from "./helpers"

const project = (p: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Thesis",
  description: "",
  area: "study",
  icon: "FolderKanban",
  color: "violet",
  status: "active",
  startDate: "2026-03-01",
  dueDate: "2026-03-31",
  milestones: [],
  goalId: null,
  notes: "",
  links: [],
  order: 1,
  completedAt: null,
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-01T09:00:00.000Z",
  ...p,
})
const ms = (id: string, doneAt: string | null = null) => ({ id, title: id, due: null, doneAt })

describe("project progress", () => {
  it("counts the project's tasks, falls back to milestones, and says when it has neither", () => {
    const tasks = [makeTask({ projectId: "p1", status: "done" }), makeTask({ projectId: "p1" }), makeTask({ projectId: "p1" }), makeTask(), makeTask({ projectId: "p2", status: "done" })]
    expect(projectProgress(project(), tasks)).toMatchObject({ ratio: 1 / 3, basis: "tasks", label: "1 of 3 tasks", tasksTotal: 3 })
    expect(projectProgress(project({ milestones: [ms("a", "2026-03-02T10:00:00.000Z"), ms("b")] }), [])).toMatchObject({ ratio: 0.5, basis: "milestones", label: "1 of 2 milestones" })
    expect(projectProgress(project(), [])).toMatchObject({ ratio: 0, basis: "none", label: "No tasks yet" })
  })
})

describe("project health", () => {
  const health = (p: Project, tasks: ReturnType<typeof makeTask>[], today: string) => projectHealth(p, projectProgress(p, tasks), tasks, today)

  it("reads the status first", () => {
    expect(health(project({ status: "done" }), [], "2026-03-10")).toBe("finished")
    expect(health(project({ status: "paused" }), [], "2026-03-10")).toBe("paused")
    expect(health(project({ status: "archived" }), [], "2026-03-10")).toBe("archived")
  })

  it("is ready to finish when every task and milestone is done, even past the deadline", () => {
    const done = [makeTask({ projectId: "p1", status: "done", completedAt: "2026-03-05T10:00:00.000Z" })]
    expect(health(project(), done, "2026-04-10")).toBe("ready")
    expect(health(project({ milestones: [ms("a")] }), done, "2026-03-10")).not.toBe("ready")
  })

  it("is overdue past its deadline, not started when empty", () => {
    expect(health(project(), [makeTask({ projectId: "p1" })], "2026-04-01")).toBe("overdue")
    expect(health(project(), [], "2026-03-10")).toBe("not-started")
  })

  it("compares progress with an even pace, but never calls the first tenth behind", () => {
    const tasks = [makeTask({ projectId: "p1", status: "done", completedAt: "2026-03-14T10:00:00.000Z" }), makeTask({ projectId: "p1" }), makeTask({ projectId: "p1" }), makeTask({ projectId: "p1" })]
    // 25% done; on 15 Mar about 47% of the time has gone
    expect(health(project(), tasks, "2026-03-15")).toBe("behind")
    // on 6 Mar about 17% has gone: within 10 points
    expect(health(project(), tasks.map((t) => ({ ...t, createdAt: "2026-03-01T09:00:00.000Z", completedAt: t.completedAt && "2026-03-05T10:00:00.000Z" })), "2026-03-06")).toBe("on-track")
    expect(health(project(), [makeTask({ projectId: "p1" }), makeTask({ projectId: "p1" })], "2026-03-03")).toBe("on-track")
    expect(health(project({ dueDate: null }), tasks, "2026-03-15")).toBe("no-deadline")
  })

  it("is stalled when nothing has moved for two weeks", () => {
    const tasks = [makeTask({ projectId: "p1", createdAt: "2026-03-01T09:00:00.000Z" })]
    expect(health(project({ dueDate: null }), tasks, "2026-03-14")).toBe("no-deadline")
    expect(health(project({ dueDate: null }), tasks, "2026-03-15")).toBe("stalled")
    expect(lastMoved(project(), [...tasks, makeTask({ projectId: "p1", status: "done", completedAt: "2026-03-20T08:00:00.000Z" })])).toBe("2026-03-20")
  })
})

describe("project helpers", () => {
  it("picks the next task: started first, then the earliest due", () => {
    const later = makeTask({ title: "later", dueDate: "2026-03-20" })
    const soon = makeTask({ title: "soon", dueDate: "2026-03-10" })
    const started = makeTask({ title: "started", status: "in_progress" })
    expect(nextUp([later, soon])?.title).toBe("soon")
    expect(nextUp([later, soon, started])?.title).toBe("started")
    expect(nextUp([makeTask({ status: "done" })])).toBeUndefined()
  })

  it("adds up focus on the project's tasks", () => {
    const own = [makeTask({ id: "a" }), makeTask({ id: "b" })]
    const sessions = [makeSession({ taskId: "a", actualSec: 1500 }), makeSession({ taskId: "b", actualSec: 600 }), makeSession({ taskId: "z", actualSec: 3000 })]
    expect(projectFocusMinutes(own, sessions)).toBe(35)
  })

  it("rebuilds a history, newest first, without tasks that joined later or repeats", () => {
    const p = project({ status: "done", completedAt: "2026-03-30T10:00:00.000Z", milestones: [ms("Draft", "2026-03-20T10:00:00.000Z")] })
    const own = [
      makeTask({ title: "Outline", createdAt: "2026-03-02T09:00:00.000Z", status: "done", completedAt: "2026-03-05T09:00:00.000Z" }),
      makeTask({ title: "Old", createdAt: "2026-02-01T09:00:00.000Z" }),
      makeTask({ title: "Repeat", createdAt: "2026-03-06T09:00:00.000Z", seriesId: "s1" }),
    ]
    expect(projectTimeline(p, own).map((e) => `${e.kind}:${e.title}`)).toEqual(["finished:Thesis", "milestone:Draft", "task.done:Outline", "task.added:Outline", "started:Thesis"])
  })

  it("describes the deadline", () => {
    expect(projectDueText(project({ dueDate: "2026-03-31" }), "2026-03-21")).toBe("10 days left")
    expect(projectDueText(project({ dueDate: "2026-03-31" }), "2026-03-31")).toBe("Due today")
    expect(projectDueText(project({ dueDate: "2026-03-31" }), "2026-04-02")).toBe("2 days overdue")
    expect(projectDueText(project({ dueDate: null }), "2026-04-02")).toBe("No deadline")
  })

  it("sorts active before paused, then by deadline", () => {
    const list = [project({ id: "c", status: "paused", dueDate: "2026-03-02" }), project({ id: "b", dueDate: null }), project({ id: "a", dueDate: "2026-03-10" })]
    expect(list.sort(compareProjects).map((p) => p.id)).toEqual(["a", "b", "c"])
  })

  it("suggests projects from tags used on two or more tasks outside projects", () => {
    const tasks = [
      makeTask({ tags: ["thesis"], area: "study" }),
      makeTask({ tags: ["thesis"], area: "study", status: "done" }),
      makeTask({ tags: ["thesis"], area: "work" }),
      makeTask({ tags: ["once"] }),
      makeTask({ tags: ["finished"], status: "done" }),
      makeTask({ tags: ["finished"], status: "done" }),
      makeTask({ tags: ["taken"] }),
      makeTask({ tags: ["taken"] }),
      makeTask({ tags: ["inside"], projectId: "p9" }),
      makeTask({ tags: ["inside"], projectId: "p9" }),
    ]
    expect(tagCandidates(tasks, [project({ name: "Taken" })])).toEqual([{ tag: "thesis", count: 3, open: 2, area: "study" }])
    expect(nameFromTag("side-project")).toBe("Side project")
  })
})

describe("project storage", () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it("creates a project, moving chosen tasks into it, and validates links and dates", async () => {
    const t = await createTask({ title: "Write intro", tags: ["thesis"] })
    const p = await createProject({ name: "  Thesis  ", startDate: "2026-03-01", links: [{ id: "l1", title: "Draft", url: "https://docs.example.com/d" }] }, { taskIds: [t.id] })
    expect(p.name).toBe("Thesis")
    expect((await db.tasks.get(t.id))?.projectId).toBe(p.id)
    await expect(createProject({ name: "Bad", startDate: "2026-03-10", dueDate: "2026-03-01" })).rejects.toThrow("The deadline is before the start")
    await expect(updateProject(p.id, { links: [{ id: "x", title: "", url: "javascript:alert(1)" }] })).rejects.toBeInstanceOf(ValidationError)
    await expect(updateProject(p.id, { goalId: "nope" })).rejects.toThrow("That goal no longer exists")
  })

  it("keeps new instances of a repeating task in the project", async () => {
    const p = await createProject({ name: "Thesis", startDate: todayISO() })
    const t = await createTask({ title: "Weekly sync", dueDate: todayISO(), recurrence: { freq: "weekly", interval: 1 }, projectId: p.id })
    const result = await completeTaskById(t.id)
    expect(result?.next?.projectId).toBe(p.id)
  })

  it("logs finishing and milestones once, and undoes them", async () => {
    const p = await createProject({ name: "Thesis", startDate: todayISO(), milestones: [{ id: "m1", title: "Draft", due: null, doneAt: null }] })
    expect(await toggleProjectMilestone(p.id, "m1")).toBe(true)
    expect(await db.activity.where("type").equals("project.milestone").count()).toBe(1)
    expect(await toggleProjectMilestone(p.id, "m1")).toBe(false)
    expect(await db.activity.where("type").equals("project.milestone").count()).toBe(0)

    const done = await setProjectStatus(p.id, "done")
    expect(done.completedAt).toBeTruthy()
    await setProjectStatus(p.id, "done")
    expect(await db.activity.where("type").equals("project.completed").count()).toBe(1)
    const reopened = await setProjectStatus(p.id, "active")
    expect(reopened.completedAt).toBeNull()
    expect(await db.activity.where("type").equals("project.completed").count()).toBe(0)
  })

  it("deletes a project keeping its tasks (or with them), and undo puts everything back", async () => {
    const p = await createProject({ name: "Thesis", startDate: todayISO() })
    const a = await createTask({ title: "A", projectId: p.id })
    const b = await createTask({ title: "B", projectId: p.id })

    const kept = await deleteProject(p.id)
    expect(await db.projects.count()).toBe(0)
    expect((await db.tasks.get(a.id))?.projectId).toBeNull()
    await restoreProject(kept)
    expect((await db.tasks.get(a.id))?.projectId).toBe(p.id)

    const gone = await deleteProject(p.id, { withTasks: true })
    expect(await db.tasks.count()).toBe(0)
    await restoreProject(gone)
    expect((await db.tasks.bulkGet([a.id, b.id])).map((t) => t?.projectId)).toEqual([p.id, p.id])
  })

  it("moves tasks between projects and out of them", async () => {
    const p = await createProject({ name: "Thesis", startDate: todayISO() })
    const t = await createTask({ title: "A" })
    await moveTasksToProject([t.id], p.id)
    expect((await db.tasks.get(t.id))?.projectId).toBe(p.id)
    await updateTask(t.id, { projectId: null })
    expect((await db.tasks.get(t.id))?.projectId).toBeNull()
  })

  it("unlinks projects from a deleted goal, and relinks them on undo", async () => {
    const g = await createGoal({ title: "Graduate", horizon: "year", startDate: todayISO() })
    const p = await createProject({ name: "Thesis", startDate: todayISO(), goalId: g.id })
    const snapshot = await deleteGoal(g.id)
    expect((await db.projects.get(p.id))?.goalId).toBeNull()
    await restoreGoal(snapshot)
    expect((await db.projects.get(p.id))?.goalId).toBe(g.id)
  })

  it("survives a backup round trip, and older backups without projects still restore", async () => {
    const p = await createProject({ name: "Thesis", startDate: todayISO(), notes: "Ask about stats" })
    await createTask({ title: "A", projectId: p.id })
    const text = JSON.stringify(await exportBackup())
    await wipeAllData()
    await restoreBackup(parseBackup(text))
    expect((await db.projects.get(p.id))?.notes).toBe("Ask about stats")
    expect((await db.tasks.toArray())[0].projectId).toBe(p.id)

    const old = JSON.parse(text)
    delete old.data.projects
    expect(parseBackup(JSON.stringify(old)).data.projects).toEqual([])
  })

  it("removing the demo removes its projects and unlinks the user's own tasks from them", async () => {
    await seedDemo()
    const demoProjects = await db.projects.toArray()
    expect(demoProjects.length).toBeGreaterThan(0)
    expect(await db.tasks.filter((t) => t.projectId === demoProjects[0].id).count()).toBeGreaterThan(0)
    const mine = await createTask({ title: "Mine", projectId: demoProjects[0].id })
    await removeDemo()
    expect(await db.projects.count()).toBe(0)
    expect((await db.tasks.get(mine.id))?.projectId).toBeNull()
  })
})
