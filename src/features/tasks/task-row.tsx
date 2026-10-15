"use client"

import { AlarmClock, CalendarDays, Check, Clock, Copy, FolderKanban, GripVertical, Hash, ListChecks, Lock, MoreHorizontal, Pencil, Repeat, Sun, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AreaBadge, Chip, PriorityFlag } from "@/components/os/visuals"
import { useLifeData } from "@/lib/db/hooks"
import { setTaskStatus, updateTask } from "@/lib/db/repo"
import { addDays, daysBetween, formatDay, formatDuration, relativeDayLabel, toISODate } from "@/lib/domain/dates"
import { isOverdue } from "@/lib/domain/tasks"
import type { Task, TaskStatus } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { ProjectChip } from "@/features/projects/shared"
import { deleteWithUndo, duplicateWithFeedback, toggleDone, wasJustCompleted } from "./task-actions"
import { SwipeRow } from "./swipe-row"

function doneLabel(doneOn: string, today: string) {
  const ago = daysBetween(doneOn, today)
  if (ago <= 0) return "Done today"
  if (ago === 1) return "Done yesterday"
  return `Done ${formatDay(doneOn, "d MMM")}`
}

export function TaskMeta({ task, today, blockedBy }: { task: Task; today: string; blockedBy?: Task[] }) {
  const overdue = isOverdue(task, today)
  const subDone = task.subtasks.filter((s) => s.done).length
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <PriorityFlag priority={task.priority} />
      {task.status === "done" && task.completedAt ? (
        <Chip icon={Check}>{doneLabel(toISODate(new Date(task.completedAt)), today)}</Chip>
      ) : (
        task.dueDate && (
          <Chip icon={CalendarDays} className={cn(overdue && "bg-rose/20 text-foreground")}>
            {relativeDayLabel(task.dueDate, today)}
            {task.dueTime && ` · ${task.dueTime}`}
          </Chip>
        )
      )}
      {task.projectId && <ProjectChip projectId={task.projectId} />}
      <AreaBadge area={task.area} />
      <Chip icon={Clock}>{formatDuration(task.estimateMin)}</Chip>
      {task.subtasks.length > 0 && (
        <Chip icon={ListChecks}>
          {subDone}/{task.subtasks.length}
        </Chip>
      )}
      {task.recurrence && <Chip icon={Repeat}>repeats</Chip>}
      {task.reminderAt && !task.reminderFired && task.status !== "done" && <Chip icon={AlarmClock}>reminder</Chip>}
      {blockedBy && blockedBy.length > 0 && (
        <Chip icon={Lock} className="bg-amber/20 text-foreground">
          waiting on {blockedBy[0].title.length > 24 ? `${blockedBy[0].title.slice(0, 24)}…` : blockedBy[0].title}
        </Chip>
      )}
      {task.tags.map((t) => (
        <Chip key={t} icon={Hash}>
          {t}
        </Chip>
      ))}
      {task.demo && <Chip className="border border-dashed border-line bg-transparent">demo</Chip>}
    </div>
  )
}

export function TaskActionsMenu({ task, today, children }: { task: Task; today: string; children?: ReactNode }) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const projects = useLifeData()?.projects.filter((p) => p.status === "active" || p.status === "paused" || p.id === task.projectId)
  const setStatus = (s: TaskStatus) => void attempt(() => setTaskStatus(task.id, s))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children ?? (
          <button type="button" aria-label={`Actions for ${task.title}`} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => openTaskEditor(task.id)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void attempt(() => updateTask(task.id, { dueDate: today }))}>
          <Sun /> Due today
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void attempt(() => updateTask(task.id, { dueDate: addDays(today, 1) }))}>
          <CalendarDays /> Due tomorrow
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => setStatus("todo")}>To do</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStatus("in_progress")}>In progress</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setStatus("done")}>Done</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {!!projects?.length && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderKanban /> Project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-64">
              {projects.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => void attempt(() => updateTask(task.id, { projectId: p.id }))}>
                  <span className="truncate">{p.name}</span>
                  {p.id === task.projectId && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
              {task.projectId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void attempt(() => updateTask(task.id, { projectId: null }))}>Take out of project</DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={() => void duplicateWithFeedback(task.id)}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void deleteWithUndo([task.id])}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TaskRow({
  task,
  today,
  blockedBy,
  selected = false,
  selecting = false,
  onSelect,
  dragHandle,
}: {
  task: Task
  today: string
  blockedBy?: Task[]
  selected?: boolean
  selecting?: boolean
  /** Without it the row has no select box (lists with no bulk actions). */
  onSelect?: (shift: boolean) => void
  dragHandle?: ReactNode
}) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const done = task.status === "done"
  return (
    <SwipeRow task={task} today={today}>
      <div className={cn("group flex items-start gap-2.5 rounded-2xl border border-transparent px-2.5 py-2.5 transition-colors hover:bg-surface-2/60", selected && "border-violet/40 bg-violet/[0.07]")}>
        {dragHandle}
        {onSelect && (
          <label className={cn("mt-0.5 grid size-5 shrink-0 place-items-center transition-opacity", selecting || selected ? "opacity-100" : "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100")}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => undefined}
              onClick={(e) => onSelect(e.shiftKey)}
              aria-label={`Select ${task.title}`}
              className="size-3.5 accent-[var(--violet)]"
            />
          </label>
        )}
        <Checkbox
          className="mt-0.5 size-5 rounded-full"
          checked={done}
          celebrate={wasJustCompleted(task.id)}
          onCheckedChange={() => void toggleDone(task)}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <button type="button" onClick={() => openTaskEditor(task.id)} className="min-w-0 flex-1 text-left">
          <span className={cn("strike block text-[0.95rem] leading-snug font-medium", done && "is-done")}>
            {task.status === "in_progress" && <span className="mr-1.5 inline-block size-2 rounded-full bg-cyan align-middle" title="In progress" />}
            <span className="strike-text">{task.title}</span>
          </span>
          <TaskMeta task={task} today={today} blockedBy={blockedBy} />
        </button>
        {/* hidden until hover only where there is hover: on touch screens the menu stays visible */}
        <div className="opacity-100 transition-opacity sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <TaskActionsMenu task={task} today={today} />
        </div>
      </div>
    </SwipeRow>
  )
}

export function DragHandle(props: React.ComponentProps<"button">) {
  return (
    <button type="button" aria-label="Drag to reorder" className="mt-0.5 grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing" {...props}>
      <GripVertical className="size-4" />
    </button>
  )
}
