import { daysBetween, formatDay, toISODate } from "./dates"
import { compareByDue, normalizeTag } from "./tasks"
import type { Area, FocusSession, ISODate, ISODateTime, Project, ProjectStatus, Task } from "./types"

/*
  Project maths. Like goals, everything here is derived from the records themselves
  (the project's tasks, milestones and focus sessions), so it can't drift from what
  actually happened.
*/

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string }> = {
  active: { label: "Active" },
  paused: { label: "Paused" },
  done: { label: "Finished" },
  archived: { label: "Archived" },
}

/** Days without anything moving before an active project counts as stalled. */
export const STALL_DAYS = 14

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const day = (iso: ISODateTime) => toISODate(new Date(iso))

export const projectTasks = (project: Pick<Project, "id">, tasks: Task[]) => tasks.filter((t) => t.projectId === project.id)

export interface ProjectProgress {
  /** 0..1 */
  ratio: number
  tasksDone: number
  tasksTotal: number
  milestonesDone: number
  milestonesTotal: number
  /** What the ratio counts: the project's tasks when it has any, otherwise its milestones. */
  basis: "tasks" | "milestones" | "none"
  /** "8 of 12 tasks", "1 of 3 milestones", "No tasks yet" */
  label: string
}

export function projectProgress(project: Project, tasks: Task[]): ProjectProgress {
  const own = projectTasks(project, tasks)
  const tasksDone = own.filter((t) => t.status === "done").length
  const milestonesTotal = project.milestones.length
  const milestonesDone = project.milestones.filter((m) => m.doneAt).length
  const counts = { tasksDone, tasksTotal: own.length, milestonesDone, milestonesTotal }
  if (own.length) return { ratio: tasksDone / own.length, ...counts, basis: "tasks", label: `${tasksDone} of ${plural(own.length, "task")}` }
  if (milestonesTotal) return { ratio: milestonesDone / milestonesTotal, ...counts, basis: "milestones", label: `${milestonesDone} of ${plural(milestonesTotal, "milestone")}` }
  return { ratio: 0, ...counts, basis: "none", label: "No tasks yet" }
}

/** The last day anything moved: the project started, a task was added or finished, or a milestone reached. */
export function lastMoved(project: Project, own: Task[]): ISODate {
  let last = project.startDate
  const bump = (d: ISODate) => {
    if (d > last) last = d
  }
  bump(day(project.createdAt))
  for (const t of own) {
    bump(day(t.createdAt))
    if (t.completedAt) bump(day(t.completedAt))
  }
  for (const m of project.milestones) if (m.doneAt) bump(day(m.doneAt))
  return last
}

export type ProjectHealth = "finished" | "archived" | "paused" | "ready" | "overdue" | "not-started" | "stalled" | "no-deadline" | "behind" | "on-track"

export const HEALTH_META: Record<ProjectHealth, { label: string; tone: "mint" | "violet" | "amber" | "rose" | "muted" }> = {
  finished: { label: "Finished", tone: "mint" },
  ready: { label: "Ready to finish", tone: "mint" },
  "on-track": { label: "On track", tone: "violet" },
  "no-deadline": { label: "In progress", tone: "violet" },
  behind: { label: "Behind", tone: "amber" },
  stalled: { label: "Stalled", tone: "amber" },
  overdue: { label: "Overdue", tone: "rose" },
  "not-started": { label: "Not started", tone: "muted" },
  paused: { label: "Paused", tone: "muted" },
  archived: { label: "Archived", tone: "muted" },
}

/**
 * How an active project is going. Everything finished: ready to finish. Past its deadline:
 * overdue. Nothing in it yet: not started. Nothing moved for STALL_DAYS: stalled. Otherwise
 * progress is compared with an even pace from start to deadline, like goals: more than 10
 * points under it is behind, except in the first tenth of the time.
 */
export function projectHealth(project: Project, progress: ProjectProgress, own: Task[], today: ISODate): ProjectHealth {
  if (project.status === "done") return "finished"
  if (project.status === "archived") return "archived"
  if (project.status === "paused") return "paused"
  if (progress.basis !== "none" && progress.ratio >= 1 && progress.milestonesDone === progress.milestonesTotal) return "ready"
  if (project.dueDate && today > project.dueDate) return "overdue"
  if (progress.basis === "none") return "not-started"
  if (daysBetween(lastMoved(project, own), today) >= STALL_DAYS) return "stalled"
  if (!project.dueDate) return "no-deadline"
  const span = daysBetween(project.startDate, project.dueDate)
  if (span <= 0) return "on-track"
  const elapsed = Math.min(1, Math.max(0, daysBetween(project.startDate, today) / span))
  if (elapsed < 0.1) return "on-track"
  return progress.ratio + 0.1 >= elapsed ? "on-track" : "behind"
}

export interface ProjectEvaluation {
  own: Task[]
  progress: ProjectProgress
  health: ProjectHealth
  next: Task | undefined
}

/** Tasks, progress, health and the next task for every project, in one pass over the tasks. */
export function evaluateProjects(projects: Project[], tasks: Task[], today: ISODate): Map<string, ProjectEvaluation> {
  const byProject = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.projectId) continue
    const list = byProject.get(t.projectId)
    if (list) list.push(t)
    else byProject.set(t.projectId, [t])
  }
  const out = new Map<string, ProjectEvaluation>()
  for (const p of projects) {
    const own = byProject.get(p.id) ?? []
    const progress = projectProgress(p, own)
    out.set(p.id, { own, progress, health: projectHealth(p, progress, own, today), next: nextUp(own) })
  }
  return out
}

/** The open task to pick up next: one already started, then the earliest due, then the most important. */
export function nextUp(own: Task[]): Task | undefined {
  return own
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || compareByDue(a, b))[0]
}

/** Minutes focused on the project's tasks. */
export function projectFocusMinutes(own: Task[], sessions: FocusSession[]): number {
  const ids = new Set(own.map((t) => t.id))
  return Math.round(sessions.reduce((sum, s) => sum + (s.taskId && ids.has(s.taskId) ? s.actualSec / 60 : 0), 0))
}

export type ProjectEventKind = "started" | "task.added" | "task.done" | "milestone" | "finished"

export interface ProjectEvent {
  at: ISODateTime
  kind: ProjectEventKind
  title: string
}

/**
 * The project's history, newest first, rebuilt from its records. Tasks that were made
 * before the project (linked to it later) or spawned by a repeating task aren't shown as
 * "added", since when they joined isn't known or isn't news.
 */
export function projectTimeline(project: Project, own: Task[], limit = 40): ProjectEvent[] {
  const events: ProjectEvent[] = [{ at: project.createdAt, kind: "started", title: project.name }]
  for (const t of own) {
    if (t.createdAt >= project.createdAt && !t.seriesId) events.push({ at: t.createdAt, kind: "task.added", title: t.title })
    if (t.status === "done" && t.completedAt) events.push({ at: t.completedAt, kind: "task.done", title: t.title })
  }
  for (const m of project.milestones) if (m.doneAt) events.push({ at: m.doneAt, kind: "milestone", title: m.title })
  if (project.status === "done" && project.completedAt) events.push({ at: project.completedAt, kind: "finished", title: project.name })
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit)
}

/** "12 days left", "Due today", "3 days overdue", "Finished 4 Mar 2026" … */
export function projectDueText(project: Project, today: ISODate): string {
  if (project.status === "done" && project.completedAt) return `Finished ${formatDay(day(project.completedAt), "d MMM yyyy")}`
  if (!project.dueDate) return "No deadline"
  const d = daysBetween(today, project.dueDate)
  if (d === 0) return "Due today"
  if (d < 0) return `${plural(-d, "day")} overdue`
  if (d < 60) return `${plural(d, "day")} left`
  if (d < 730) return `${Math.round(d / 30)} months left`
  return `${(d / 365).toFixed(1)} years left`
}

const STATUS_RANK: Record<ProjectStatus, number> = { active: 0, paused: 1, done: 2, archived: 3 }

/** Active before paused, then the nearest deadline (none last), then the order they were made in. */
export function compareProjects(a: Project, b: Project) {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.order - b.order
}

/** "thesis" → "Thesis", "side-project" → "Side project". */
export function nameFromTag(tag: string): string {
  const words = tag.replace(/[-_]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface TagCandidate {
  tag: string
  /** Tasks with the tag that aren't in a project yet. */
  count: number
  open: number
  /** The life area most of them are in. */
  area: Area
}

/**
 * Tags that look like projects: on two or more tasks outside any project, at least one
 * still open, and not already the name of a project. Before Projects existed, the app
 * suggested tagging tasks with a project's name, so these turn into projects in one tap.
 */
export function tagCandidates(tasks: Task[], projects: Project[], limit = 6): TagCandidate[] {
  const taken = new Set(projects.map((p) => normalizeTag(p.name)))
  const byTag = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.projectId) continue
    for (const tag of t.tags) {
      const list = byTag.get(tag)
      if (list) list.push(t)
      else byTag.set(tag, [t])
    }
  }
  const out: TagCandidate[] = []
  for (const [tag, list] of byTag) {
    const open = list.filter((t) => t.status !== "done").length
    if (list.length < 2 || !open || taken.has(tag)) continue
    const areas = new Map<Area, number>()
    for (const t of list) areas.set(t.area, (areas.get(t.area) ?? 0) + 1)
    const area = [...areas].sort((a, b) => b[1] - a[1])[0][0]
    out.push({ tag, count: list.length, open, area })
  }
  return out.sort((a, b) => b.open - a.open || b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit)
}
