"use client"

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { blockingTasks, compareByDue } from "@/lib/domain/tasks"
import type { Task, TaskStatus } from "@/lib/domain/types"
import { BlockedError, setTaskStatus } from "@/lib/db/repo"
import { reportError } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { toggleDone } from "./task-actions"
import { TaskActionsMenu, TaskMeta } from "./task-row"

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: "todo", label: "To do", dot: "bg-lilac" },
  { status: "in_progress", label: "In progress", dot: "bg-cyan" },
  { status: "done", label: "Done", dot: "bg-mint" },
]

export function TaskBoard({ tasks, today, byId }: { tasks: Task[]; today: string; byId: Map<string, Task> }) {
  const [active, setActive] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const onStart = (e: DragStartEvent) => setActive(tasks.find((t) => t.id === e.active.id) ?? null)
  const onEnd = async (e: DragEndEvent) => {
    setActive(null)
    const task = tasks.find((t) => t.id === e.active.id)
    const target = e.over?.id as TaskStatus | undefined
    if (!task || !target || target === task.status) return
    try {
      await setTaskStatus(task.id, target)
      if (target === "done") toast.success("Done", { description: task.title })
    } catch (err) {
      if (err instanceof BlockedError) toast.error(err.message, { description: "Moved back: prerequisites come first." })
      else reportError(err)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={(e) => void onEnd(e)} onDragCancel={() => setActive(null)}>
      <div className="grid gap-4 @4xl/main:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = tasks.filter((t) => t.status === col.status)
          // open work: overdue and urgent first; finished work: most recent first
          list.sort(col.status === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : compareByDue)
          return <Column key={col.status} col={col} tasks={list} today={today} byId={byId} />
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
        {active ? <Card task={active} today={today} byId={byId} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ col, tasks, today, byId }: { col: (typeof COLUMNS)[number]; tasks: Task[]; today: string; byId: Map<string, Task> }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status })
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  return (
    <section ref={setNodeRef} aria-label={`${col.label} column`} className={cn("glass flex min-h-64 flex-col rounded-dialog p-3 transition-colors", isOver && "ring-2 ring-violet/50")}>
      <header className="flex items-center gap-2 px-2 pt-1 pb-3">
        <span className={cn("size-2 rounded-full", col.dot)} />
        <h2 className="text-sm font-semibold">{col.label}</h2>
        <span className="text-xs text-muted-foreground tabular">{tasks.length}</span>
        {col.status !== "done" && (
          <button type="button" aria-label={`Add task to ${col.label}`} onClick={() => openTaskEditor(null, { status: col.status })} className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground">
            <Plus className="size-4" />
          </button>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 && <p className="rounded-2xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted-foreground">Drop tasks here</p>}
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} today={today} byId={byId} />
        ))}
      </div>
    </section>
  )
}

function DraggableCard({ task, today, byId }: { task: Task; today: string; byId: Map<string, Task> }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl", isDragging && "opacity-30")} aria-roledescription="Draggable task" aria-describedby={undefined}>
      <Card task={task} today={today} byId={byId} />
    </div>
  )
}

function Card({ task, today, byId, overlay }: { task: Task; today: string; byId: Map<string, Task>; overlay?: boolean }) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const done = task.status === "done"
  return (
    <article className={cn("group rounded-2xl border border-line bg-card/90 p-3 shadow-sm transition-shadow hover:shadow-md", overlay && "rotate-[1.5deg] shadow-2xl ring-1 ring-violet/40")}>
      <div className="flex items-start gap-2.5">
        <Checkbox
          className="mt-0.5 size-[18px] rounded-full"
          checked={done}
          onPointerDown={(e) => e.stopPropagation()}
          onCheckedChange={() => void toggleDone(task)}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => openTaskEditor(task.id)} className={cn("min-w-0 flex-1 text-left text-sm leading-snug font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
        </button>
        <div onPointerDown={(e) => e.stopPropagation()} className="-mt-1 -mr-1">
          <TaskActionsMenu task={task} today={today} />
        </div>
      </div>
      <TaskMeta task={task} today={today} blockedBy={done ? [] : blockingTasks(task, byId)} />
    </article>
  )
}
