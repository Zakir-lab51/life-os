"use client"

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"
import { Plus } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { blockingTasks } from "@/lib/domain/tasks"
import type { Task, TaskStatus } from "@/lib/domain/types"
import { BlockedError, setTaskStatus } from "@/lib/db/repo"
import { reportError } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { arrangeBoard, settlePending } from "./board-layout"
import { toggleDone, wasJustCompleted } from "./task-actions"
import { TaskActionsMenu, TaskMeta } from "./task-row"

const COLUMNS: { status: TaskStatus; label: string; dot: string; empty: string }[] = [
  { status: "todo", label: "To do", dot: "bg-lilac", empty: "Nothing waiting. Add a task, or drag one back here." },
  { status: "in_progress", label: "In progress", dot: "bg-cyan", empty: "Drag a task here when you start it." },
  { status: "done", label: "Done", dot: "bg-mint", empty: "Finished tasks land here." },
]
const label = (status: TaskStatus | undefined) => COLUMNS.find((c) => c.status === status)?.label ?? "no column"

const INSTRUCTIONS =
  "To move a task, press Space or Enter to pick it up, use the arrow keys to choose a column, then press Space or Enter to drop it. Escape cancels."

/**
 * The Kanban board. While a card is dragged, its place moves to the column under it, so
 * the card lands exactly where it will stay; after a drop the move shows at once and the
 * write catches up (a blocked move is put back). Mouse drags start after 6 px; touch drags
 * start on a short press-and-hold, so swiping over cards still scrolls the page. With the
 * keyboard, arrows jump from column to column.
 */
export function TaskBoard({ tasks, today, byId }: { tasks: Task[]; today: string; byId: Map<string, Task> }) {
  const [active, setActive] = useState<Task | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  // moves already dropped, shown until the database reports them
  const [pending, setPending] = useState<ReadonlyMap<string, TaskStatus>>(new Map())
  const column = useRef<TaskStatus | null>(null)
  // a picked-up card starts over its own column; saying so would talk over "Picked up …"
  const quietStart = useRef(false)

  // when the live query updates, forget moves it now shows (or tasks that are gone)
  const [seen, setSeen] = useState(byId)
  if (seen !== byId) {
    setSeen(byId)
    const settled = settlePending(pending, byId)
    if (settled !== pending) setPending(settled)
  }

  const keyboardColumns: KeyboardCoordinateGetter = (event, { context }) => {
    const step = event.code === "ArrowRight" || event.code === "ArrowDown" ? 1 : event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 0
    if (!step) return undefined
    event.preventDefault()
    const at = COLUMNS.findIndex((c) => c.status === column.current)
    const next = COLUMNS[Math.min(COLUMNS.length - 1, Math.max(0, at + step))]
    const rect = context.droppableRects.get(next.status)
    return rect ? { x: rect.left + 12, y: rect.top + 44 } : undefined
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardColumns }),
  )

  const title = (id: string | number) => byId.get(String(id))?.title ?? "Task"
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${title(a.id)}, in ${label(byId.get(String(a.id))?.status)}.`,
    onDragOver: ({ active: a, over: o }) => {
      const own = quietStart.current && o?.id === byId.get(String(a.id))?.status
      quietStart.current = false
      if (own) return undefined
      return o ? `${title(a.id)} is over ${label(o.id as TaskStatus)}.` : `${title(a.id)} is not over a column.`
    },
    onDragEnd: ({ active: a, over: o }) => (o ? `${title(a.id)} moved to ${label(o.id as TaskStatus)}.` : `${title(a.id)} was put back.`),
    onDragCancel: ({ active: a }) => `Cancelled. ${title(a.id)} stays in ${label(byId.get(String(a.id))?.status)}.`,
  }

  const onStart = (e: DragStartEvent) => {
    const task = byId.get(String(e.active.id)) ?? null
    setActive(task)
    column.current = task?.status ?? null
    quietStart.current = true
  }
  const onOver = (e: DragOverEvent) => {
    const target = (e.over?.id as TaskStatus | undefined) ?? null
    setOver(target)
    if (target) column.current = target
  }
  const reset = () => {
    setActive(null)
    setOver(null)
    column.current = null
  }
  const onEnd = async (e: DragEndEvent) => {
    reset()
    const task = byId.get(String(e.active.id))
    const target = e.over?.id as TaskStatus | undefined
    if (!task || !target || target === task.status) return
    setPending((p) => new Map(p).set(task.id, target))
    try {
      await setTaskStatus(task.id, target)
      if (target === "done") toast.success("Done", { description: task.title })
    } catch (err) {
      setPending((p) => {
        const next = new Map(p)
        next.delete(task.id)
        return next
      })
      if (err instanceof BlockedError) toast.error(err.message, { description: "Moved back: prerequisites come first." })
      else reportError(err)
    }
  }

  const columns = arrangeBoard(tasks, pending, active ? { id: active.id, over } : null)

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={(e) => void onEnd(e)}
      onDragCancel={reset}
    >
      <div className="grid gap-4 @4xl/main:grid-cols-3">
        {COLUMNS.map((col) => (
          <Column key={col.status} col={col} tasks={columns[col.status]} today={today} byId={byId} dragging={!!active} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
        {active ? <Card task={active} today={today} byId={byId} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ col, tasks, today, byId, dragging }: { col: (typeof COLUMNS)[number]; tasks: Task[]; today: string; byId: Map<string, Task>; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status })
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  return (
    <section
      ref={setNodeRef}
      aria-label={`${col.label} column`}
      className={cn("glass flex min-h-64 flex-col rounded-dialog p-3 outline-2 -outline-offset-2 outline-transparent transition-[outline-color] duration-200", isOver && "outline-violet/60")}
    >
      <header className="flex items-center gap-2 px-2 pt-1 pb-3">
        <span className={cn("size-2 rounded-full", col.dot)} />
        <h2 className="text-sm font-semibold">{col.label}</h2>
        <span className="text-xs text-muted-foreground tabular">{tasks.length}</span>
        {col.status !== "done" && (
          <button
            type="button"
            aria-label={`Add task to ${col.label}`}
            onClick={() => openTaskEditor(null, { status: col.status })}
            className="pressable ml-auto grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" />
          </button>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {tasks.length === 0 && (
          <p className={cn("grid flex-1 place-items-center rounded-2xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground transition-colors", dragging ? "border-violet/50" : "border-line")}>
            {dragging ? "Drop it here" : col.empty}
          </p>
        )}
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} today={today} byId={byId} />
        ))}
      </div>
    </section>
  )
}

function DraggableCard({ task, today, byId }: { task: Task; today: string; byId: Map<string, Task> }) {
  // a group, not a button: the card holds its own tick-box, title button and menu
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, attributes: { role: "group", roleDescription: "draggable task" } })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      className={cn("touch-manipulation rounded-2xl outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-30")}
    >
      <Card task={task} today={today} byId={byId} />
    </div>
  )
}

/** Stops a press on a control inside a card from starting a drag. */
const keep = { onMouseDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onTouchStart: (e: { stopPropagation(): void }) => e.stopPropagation() }

function Card({ task, today, byId, overlay }: { task: Task; today: string; byId: Map<string, Task>; overlay?: boolean }) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const done = task.status === "done"
  return (
    <article className={cn("group rounded-2xl border border-line bg-card/90 p-3 shadow-sm transition-shadow hover:shadow-md", overlay && "scale-[1.02] rotate-[1.5deg] cursor-grabbing shadow-2xl ring-1 ring-violet/40")}>
      <div className="flex items-start gap-2.5">
        <Checkbox
          {...keep}
          className="mt-0.5 size-[18px] rounded-full"
          checked={done}
          celebrate={wasJustCompleted(task.id)}
          onCheckedChange={() => void toggleDone(task)}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <button {...keep} type="button" onClick={() => openTaskEditor(task.id)} className={cn("strike min-w-0 flex-1 text-left text-sm leading-snug font-medium", done && "is-done")}>
          <span className="strike-text">{task.title}</span>
        </button>
        <div {...keep} className="-mt-1 -mr-1">
          <TaskActionsMenu task={task} today={today} />
        </div>
      </div>
      <TaskMeta task={task} today={today} blockedBy={done ? [] : blockingTasks(task, byId)} />
    </article>
  )
}
