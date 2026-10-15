"use client"

import { Archive, ArchiveRestore, Check, ChevronLeft, CircleCheck, Ellipsis, ExternalLink, Flag, FolderKanban, Link2, Pause, Pencil, Play, Plus, RotateCcw, Target, Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Segmented } from "@/components/os/field"
import { MilestoneTrack } from "@/components/os/milestones"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { AreaBadge, Chip, EmptyState, RingGauge } from "@/components/os/visuals"
import { ValidationError, deleteProject, moveTasksToProject, restoreProject, setProjectStatus, toggleProjectMilestone, updateProject } from "@/lib/db/repo"
import { daysBetween, formatDay, formatDuration, toISODate } from "@/lib/domain/dates"
import { evaluateProjects, projectDueText, projectFocusMinutes, projectTimeline, lastMoved, type ProjectEvent, type ProjectEvaluation } from "@/lib/domain/projects"
import { blockingTasks, compareByDue } from "@/lib/domain/tasks"
import type { Project, ProjectStatus, Task } from "@/lib/domain/types"
import { attempt, reportError, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn, uid } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"
import { TaskBoard } from "@/features/tasks/task-board"
import { TaskQuickAdd } from "@/features/tasks/task-quick-add"
import { TaskRow } from "@/features/tasks/task-row"
import { useSettling } from "@/features/tasks/task-actions"
import { closeProject } from "./route"
import { CurrentProjectProvider, HealthBadge, ProjectGlyph } from "./shared"

type TaskView = "list" | "board"

// the project being deleted from its own page: while the page steps back to the list, it shows nothing rather than "not found"
let leaving: string | null = null

/** A project's own page: what it's for and how it's going, its tasks (list or board), milestones, notes, links and history. */
export function ProjectWorkspace({ id, life }: { id: string; life: Life }) {
  const project = life.data.projects.find((p) => p.id === id)
  if (!project) return leaving === id ? null : <Missing />
  return (
    <CurrentProjectProvider value={project.id}>
      <Workspace project={project} life={life} />
    </CurrentProjectProvider>
  )
}

function BackToList() {
  return (
    <button type="button" onClick={closeProject} className="pressable -ml-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-sm font-medium tracking-normal normal-case hover:text-foreground">
      <ChevronLeft className="size-4" /> Projects
    </button>
  )
}

function Missing() {
  return (
    <PageTransition>
      <PageHeader eyebrow={<BackToList />} title="Project not found" />
      <Panel>
        <EmptyState
          compact
          icon={FolderKanban}
          title="This project isn't here"
          body="It may have been deleted, or it lives on another device."
          action={
            <Button size="sm" variant="secondary" onClick={closeProject}>
              All projects
            </Button>
          }
        />
      </Panel>
    </PageTransition>
  )
}

function Workspace({ project, life }: { project: Project; life: Life }) {
  const { data, today } = life
  const evaluation = useMemo(() => evaluateProjects([project], data.tasks, today).get(project.id)!, [project, data.tasks, today])
  const [view, setView] = useState<TaskView>("list")
  const open = project.status === "active" || project.status === "paused"

  return (
    <PageTransition>
      <Header project={project} evaluation={evaluation} />
      <Overview project={project} evaluation={evaluation} life={life} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight on-backdrop">
          Tasks{" "}
          <span className="text-sm font-normal text-muted-backdrop tabular">
            {evaluation.progress.tasksTotal - evaluation.progress.tasksDone} open · {evaluation.progress.tasksDone} done
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {open && <AddExisting project={project} tasks={data.tasks} />}
          <Segmented<TaskView>
            ariaLabel="Show tasks as"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "List" },
              { value: "board", label: "Board" },
            ]}
          />
        </div>
      </div>

      <div className={cn("grid gap-4", view === "list" && "@4xl/main:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")}>
        <div className="min-w-0">{view === "list" ? <TaskList project={project} own={evaluation.own} life={life} /> : <Board project={project} own={evaluation.own} life={life} />}</div>
        <div className={cn("grid content-start gap-4", view === "board" && "@3xl/main:grid-cols-2")}>
          <Milestones project={project} today={today} />
          <Notes key={project.id} project={project} />
          <Links project={project} />
          <History project={project} own={evaluation.own} />
        </div>
      </div>
    </PageTransition>
  )
}

/* ── header ─────────────────────────────────────────── */

function Header({ project, evaluation }: { project: Project; evaluation: ProjectEvaluation }) {
  const openProjectEditor = useUI((s) => s.openProjectEditor)
  const open = project.status === "active" || project.status === "paused"
  const taskCount = evaluation.own.length

  const setStatus = async (status: ProjectStatus) => {
    if (!(await succeeded(() => setProjectStatus(project.id, status)))) return
    if (status === "done") toast.success("Project finished", { description: project.name, icon: <CircleCheck className="size-4" /> })
  }
  const remove = async (withTasks: boolean) => {
    leaving = project.id
    const snapshot = await attempt(() => deleteProject(project.id, { withTasks }))
    if (!snapshot) {
      leaving = null
      return
    }
    closeProject()
    toast("Project deleted", {
      description: withTasks ? `${project.name}, with ${taskCount} task${taskCount === 1 ? "" : "s"}` : `${project.name}. Its tasks are still in Tasks.`,
      action: { label: "Undo", onClick: () => void succeeded(() => restoreProject(snapshot)) },
    })
  }

  return (
    <PageHeader
      eyebrow={<BackToList />}
      title={
        <span className="flex items-center gap-3">
          <ProjectGlyph project={project} size="lg" />
          <span className="min-w-0">{project.name}</span>
        </span>
      }
      description={project.description || undefined}
      actions={
        <>
          {open ? (
            <Button variant={evaluation.health === "ready" ? "default" : "outline"} onClick={() => void setStatus("done")}>
              <CircleCheck /> Finish
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void setStatus("active")}>
              <RotateCcw /> {project.status === "done" ? "Reopen" : "Restore"}
            </Button>
          )}
          <Button variant="outline" onClick={() => openProjectEditor(project.id)}>
            <Pencil /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="More project actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {project.status === "active" && (
                <DropdownMenuItem onSelect={() => void setStatus("paused")}>
                  <Pause /> Pause
                </DropdownMenuItem>
              )}
              {project.status === "paused" && (
                <DropdownMenuItem onSelect={() => void setStatus("active")}>
                  <Play /> Resume
                </DropdownMenuItem>
              )}
              {project.status !== "archived" ? (
                <DropdownMenuItem onSelect={() => void setStatus("archived")}>
                  <Archive /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => void setStatus("active")}>
                  <ArchiveRestore /> Unarchive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove(false)}>
                <Trash2 /> {taskCount ? "Delete, keep its tasks" : "Delete"}
              </DropdownMenuItem>
              {taskCount > 0 && (
                <DropdownMenuItem variant="destructive" onSelect={() => void remove(true)}>
                  <Trash2 /> Delete with its {taskCount} task{taskCount === 1 ? "" : "s"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  )
}

/* ── overview ───────────────────────────────────────── */

/** A plain-language read of how the project is going. */
function healthSentence(project: Project, e: ProjectEvaluation, today: string): string {
  const { progress, health, next, own } = e
  const pct = Math.round(progress.ratio * 100)
  const open = own.filter((t) => t.status !== "done").length
  const elapsed = project.dueDate ? Math.round(Math.min(1, Math.max(0, daysBetween(project.startDate, today) / Math.max(1, daysBetween(project.startDate, project.dueDate)))) * 100) : null
  const nextStep = next ? ` Next: “${next.title}”.` : ""
  switch (health) {
    case "finished":
      return `Finished ${formatDay(toISODate(new Date(project.completedAt!)), "d MMM yyyy")}. Reopen it if there's more to do.`
    case "archived":
      return "Archived, with its tasks, notes and history kept. Restore it any time."
    case "paused":
      return "Paused. Its tasks still show in Tasks and My Day; resume it when you pick it back up."
    case "ready":
      return "Everything's done. Mark it finished when you're ready."
    case "overdue": {
      const late = daysBetween(project.dueDate!, today)
      return `The deadline passed ${late} day${late === 1 ? "" : "s"} ago with ${open} task${open === 1 ? "" : "s"} open. Finish what's left, or move the deadline.`
    }
    case "not-started":
      return "Nothing in it yet. Add its first tasks below, or milestones for the big steps."
    case "stalled": {
      const quiet = daysBetween(lastMoved(project, own), today)
      return `Nothing has moved for ${quiet} days.${nextStep}`
    }
    case "no-deadline":
      return `${pct}% done, with no deadline.${nextStep}`
    case "behind":
      return `${pct}% done with ${elapsed}% of the time gone: behind an even pace.${nextStep}`
    case "on-track":
      return elapsed !== null && elapsed < 10 ? `Early days: ${pct}% done.${nextStep}` : `${pct}% done with ${elapsed}% of the time gone: on pace.${nextStep}`
  }
}

function Overview({ project, evaluation, life }: { project: Project; evaluation: ProjectEvaluation; life: Life }) {
  const showGoal = useUI((s) => s.showGoal)
  const { progress, health, own } = evaluation
  const pct = Math.round(progress.ratio * 100)
  const goal = project.goalId ? life.data.goals.find((g) => g.id === project.goalId) : undefined
  const focusMin = useMemo(() => projectFocusMinutes(own, life.data.sessions), [own, life.data.sessions])

  return (
    <Panel className="mb-6">
      <div className="flex flex-col gap-5 @2xl:flex-row @2xl:items-center">
        <RingGauge value={pct} size={112} stroke={10} tone={project.status === "done" ? "mint" : project.color} label={`${pct}% · ${progress.label}`}>
          <div>
            <div className="text-2xl leading-none font-semibold tracking-tight tabular">{pct}%</div>
            <div className="mt-1 text-[11px] text-muted-foreground">done</div>
          </div>
        </RingGauge>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <HealthBadge health={health} />
            <AreaBadge area={project.area} />
            {goal && (
              <button type="button" onClick={() => showGoal(goal.id)} className="pressable inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2/70 py-0.5 pr-2.5 pl-2 text-[11px] text-muted-foreground ring-1 ring-line hover:text-foreground">
                <Target className="size-3.5 shrink-0" />
                <span className="truncate">
                  Serves <span className="font-medium text-foreground">{goal.title}</span>
                </span>
              </button>
            )}
            {project.demo && <Chip className="border border-dashed border-line bg-transparent">demo</Chip>}
          </div>
          <p className="text-sm">{healthSentence(project, evaluation, life.today)}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
            <Fact label="Tasks" value={progress.tasksTotal ? `${progress.tasksDone}/${progress.tasksTotal}` : "–"} />
            <Fact label="Milestones" value={progress.milestonesTotal ? `${progress.milestonesDone}/${progress.milestonesTotal}` : "–"} />
            <Fact label="Focused" value={focusMin ? formatDuration(focusMin) : "–"} />
            {project.dueDate ? <Fact label="Deadline" value={formatDay(project.dueDate, "d MMM yyyy")} sub={projectDueText(project, life.today)} /> : <Fact label="Started" value={formatDay(project.startDate, "d MMM yyyy")} sub="No deadline" />}
          </dl>
        </div>
      </div>
    </Panel>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-[0.95rem] font-semibold tabular">{value}</dd>
      {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
    </div>
  )
}

/* ── tasks ──────────────────────────────────────────── */

/** Open tasks first (started, then by due date); a just-ticked task holds its place for a moment, then glides down. */
function TaskList({ project, own, life }: { project: Project; own: Task[]; life: Life }) {
  const settling = useSettling()
  const [showDone, setShowDone] = useState(false)
  const byId = useMemo(() => new Map(life.data.tasks.map((t) => [t.id, t])), [life.data.tasks])
  const isOpen = (t: Task) => t.status !== "done" || settling.has(t.id)
  const open = own.filter(isOpen).sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || compareByDue(a, b))
  const done = own.filter((t) => !isOpen(t)).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
  const accepting = project.status === "active" || project.status === "paused"

  const row = (t: Task) => (
    <motion.div key={t.id} layout="position" layoutId={`project-task-${t.id}`}>
      <TaskRow task={t} today={life.today} blockedBy={blockingTasks(t, byId)} />
    </motion.div>
  )

  return (
    <Panel className="p-2 sm:p-3">
      {accepting && (
        <div className="px-1 pt-1 sm:px-2 sm:pt-2">
          <TaskQuickAdd projectId={project.id} area={project.area} inPanel />
        </div>
      )}
      {open.length ? (
        open.map(row)
      ) : (
        <EmptyState
          compact
          tone={done.length ? "clear" : "start"}
          icon={done.length ? Check : Plus}
          title={done.length ? "Every task is done" : "No tasks yet"}
          body={done.length ? (accepting ? "Add what's next above, or finish the project." : undefined) : "Type the first one above: “Draft the outline next fri p2 45m”."}
        />
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
            className="flex w-full items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-mint" />
            Done <span className="tabular">{done.length}</span>
            <span className="ml-auto text-[11px] font-medium tracking-normal normal-case">{showDone ? "Hide" : "Show"}</span>
          </button>
          {showDone && done.map(row)}
        </>
      )}
    </Panel>
  )
}

/** The project's own Kanban. Boards are glass themselves, so this one sits straight on the page, not in a tile. */
function Board({ project, own, life }: { project: Project; own: Task[]; life: Life }) {
  const byId = useMemo(() => new Map(life.data.tasks.map((t) => [t.id, t])), [life.data.tasks])
  return (
    <div>
      {(project.status === "active" || project.status === "paused") && <TaskQuickAdd projectId={project.id} area={project.area} />}
      <TaskBoard tasks={own} today={life.today} byId={byId} defaults={{ projectId: project.id, area: project.area }} />
    </div>
  )
}

/** Pick open tasks from anywhere to move into this project. */
function AddExisting({ project, tasks }: { project: Project; tasks: Task[] }) {
  const [open, setOpen] = useState(false)
  const candidates = useMemo(() => tasks.filter((t) => t.projectId !== project.id && t.status !== "done").sort(compareByDue), [tasks, project.id])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" disabled={!candidates.length}>
          <Link2 /> Add existing
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Find an open task…" />
          <CommandList>
            <CommandEmpty>No matching open tasks</CommandEmpty>
            <CommandGroup heading="Tap to move into this project">
              {candidates.map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${t.id}`} onSelect={() => void attempt(() => moveTasksToProject([t.id], project.id))}>
                  <span className="truncate">{t.title}</span>
                  {t.projectId && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">in another project</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ── side panels ────────────────────────────────────── */

function Milestones({ project, today }: { project: Project; today: string }) {
  const open = project.status === "active" || project.status === "paused"
  const reached = project.milestones.filter((m) => m.doneAt).length
  return (
    <Panel>
      <PanelHeader title="Milestones" subtitle={project.milestones.length ? `${reached} of ${project.milestones.length} reached` : "The big steps along the way"} />
      {project.milestones.length || open ? (
        <MilestoneTrack
          milestones={project.milestones}
          today={today}
          onToggle={(m) =>
            void attempt(async () => {
              if (await toggleProjectMilestone(project.id, m.id)) toast.success("Milestone reached", { description: m.title })
            })
          }
          onAdd={open ? (title, due) => succeeded(() => updateProject(project.id, { milestones: [...project.milestones, { id: uid("ms_"), title, due, doneAt: null }] })) : undefined}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No milestones.</p>
      )}
    </Panel>
  )
}

/**
 * Notes save themselves a moment after you stop typing, when you leave the field, and when
 * you leave the page. Changes from another device come in while you aren't editing.
 */
function Notes({ project }: { project: Project }) {
  const [text, setText] = useState(project.notes)
  const [dirty, setDirty] = useState(false)
  const [seen, setSeen] = useState(project.notes)
  if (project.notes !== seen) {
    setSeen(project.notes)
    if (!dirty) setText(project.notes)
  }
  const latest = useRef(project.notes)
  const timer = useRef<number | undefined>(undefined)

  const save = async () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const value = latest.current
    if (await succeeded(() => updateProject(project.id, { notes: value })) && latest.current === value) setDirty(false)
  }
  // a note typed just before leaving the page still gets saved
  useEffect(
    () => () => {
      if (timer.current === undefined) return
      window.clearTimeout(timer.current)
      void attempt(() => updateProject(project.id, { notes: latest.current }))
    },
    [project.id],
  )

  return (
    <Panel>
      <PanelHeader title="Notes" subtitle="Saved as you type" />
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDirty(true)
          latest.current = e.target.value
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => void save(), 700)
        }}
        onBlur={() => timer.current !== undefined && void save()}
        placeholder="Decisions, contacts, ideas, what you learned…"
        aria-label="Project notes"
        maxLength={20000}
        className="min-h-36 rounded-xl"
      />
    </Panel>
  )
}

/** Links kept with the project. They open in a new tab; no previews are fetched, so nothing leaves the device. */
function Links({ project }: { project: Project }) {
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const open = project.status === "active" || project.status === "paused"

  const add = async () => {
    const raw = url.trim()
    if (!raw) return
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
    let name = title.trim()
    if (!name) {
      try {
        name = new URL(href).hostname.replace(/^www\./, "") || raw
      } catch {
        name = raw
      }
    }
    try {
      await updateProject(project.id, { links: [...project.links, { id: uid("l_"), title: name.slice(0, 120), url: href }] })
      setTitle("")
      setUrl("")
      setError(null)
    } catch (e) {
      if (e instanceof ValidationError) setError(Object.values(e.fields)[0] ?? e.message)
      else reportError(e)
    }
  }
  const remove = (id: string) => void attempt(() => updateProject(project.id, { links: project.links.filter((l) => l.id !== id) }))
  const host = (href: string) => {
    try {
      return new URL(href).hostname.replace(/^www\./, "")
    } catch {
      return href
    }
  }

  return (
    <Panel>
      <PanelHeader title="Links" subtitle={project.links.length ? undefined : "Docs, folders and references for it"} />
      {project.links.length > 0 && (
        <ul className="-mx-2 mb-3 space-y-0.5">
          {project.links.map((l) => (
            <li key={l.id} className="group/link flex items-center gap-1 rounded-xl hover:bg-foreground/[0.03]">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground ring-1 ring-line">
                  <ExternalLink className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{l.title}</span>
                  {host(l.url) !== l.title && <span className="block truncate text-xs text-muted-foreground">{host(l.url)}</span>}
                </span>
              </a>
              <Button size="icon-xs" variant="ghost" aria-label={`Remove ${l.title}`} className="mr-1 pointer-fine:opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100" onClick={() => remove(l.id)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" aria-label="Link address" inputMode="url" maxLength={2000} aria-invalid={!!error} className="h-9 rounded-xl" />
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (optional)" aria-label="Link name" maxLength={120} className="h-9 min-w-0 flex-1 rounded-xl" />
            <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={!url.trim()}>
              <Plus /> Add
            </Button>
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
        </form>
      )}
    </Panel>
  )
}

const EVENT_META: Record<ProjectEvent["kind"], { label: string; icon: ReactNode }> = {
  started: { label: "Started", icon: <FolderKanban className="size-3.5 text-violet" /> },
  "task.added": { label: "Added", icon: <Plus className="size-3.5 text-muted-foreground" /> },
  "task.done": { label: "Done", icon: <Check className="size-3.5 text-mint" /> },
  milestone: { label: "Milestone", icon: <Flag className="size-3.5 text-violet" /> },
  finished: { label: "Finished", icon: <CircleCheck className="size-3.5 text-mint" /> },
}

/** What happened in the project, newest first, rebuilt from its records. */
function History({ project, own }: { project: Project; own: Task[] }) {
  const [all, setAll] = useState(false)
  const events = projectTimeline(project, own)
  const shown = all ? events : events.slice(0, 8)
  return (
    <Panel>
      <PanelHeader title="History" />
      <ol className="space-y-2">
        {shown.map((e, i) => (
          <li key={`${e.kind}:${e.at}:${i}`} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 ring-1 ring-line">{EVENT_META[e.kind].icon}</span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{EVENT_META[e.kind].label}: </span>
              {e.title}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular">{formatDay(toISODate(new Date(e.at)), "d MMM")}</span>
          </li>
        ))}
      </ol>
      {events.length > 8 && (
        <Button size="xs" variant="ghost" className="mt-2 self-start" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${events.length}`}
        </Button>
      )}
    </Panel>
  )
}
