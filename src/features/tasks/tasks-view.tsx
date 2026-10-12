"use client"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "motion/react"
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Columns3,
  Flag,
  List,
  Plus,
  Search,
  SquareCheckBig,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel } from "@/components/os/panel"
import { EmptyState, Kbd } from "@/components/os/visuals"
import { useBlocks, useNow } from "@/lib/db/hooks"
import { bulkSetStatus, bulkUpdateTasks, createBlock, reorderTasks } from "@/lib/db/repo"
import { AREA_META, PRIORITY_META } from "@/lib/domain/areas"
import { addDays, daysBetween, formatClock, formatDuration, roundUpTo, toISODate } from "@/lib/domain/dates"
import { freeSlots, totalFree } from "@/lib/domain/planner"
import { recommendTasks, scoreTask, type Recommendation } from "@/lib/domain/scheduling"
import { BUCKET_LABEL, blockingTasks, compareByDue, compareByPriority, dueBucket, type DueBucket } from "@/lib/domain/tasks"
import { AREAS, type Area, type Priority, type Task, type TaskStatus } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import { deleteWithUndo } from "./task-actions"
import { TaskBoard } from "./task-board"
import { DragHandle, TaskRow } from "./task-row"

type ViewFilter = "open" | "today" | "upcoming" | "overdue" | "someday" | "done"
type Sort = "smart" | "due" | "priority" | "manual" | "created"

const VIEWS: { id: ViewFilter; label: string }[] = [
  { id: "open", label: "All open" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "overdue", label: "Overdue" },
  { id: "someday", label: "No date" },
  { id: "done", label: "Completed" },
]

export function TasksView() {
  const life = useLife()
  const blocks = useBlocks(life?.today ?? "")
  if (!life || !blocks) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-16 w-72 rounded-2xl" />
        <Skeleton className="h-40 rounded-panel" />
        <Skeleton className="h-96 rounded-panel" />
      </div>
    )
  }
  return <Tasks life={life} blocks={blocks} />
}

function Tasks({ life, blocks }: { life: Life; blocks: NonNullable<ReturnType<typeof useBlocks>> }) {
  const { data, today, prefs } = life
  const view = useUI((s) => s.taskView)
  const setView = useUI((s) => s.setTaskView)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const [filter, setFilter] = useState<ViewFilter>("open")
  const [query, setQuery] = useState("")
  const [area, setArea] = useState<Area | "any">("any")
  const [priority, setPriority] = useState<Priority | "any">("any")
  const [tag, setTag] = useState<string>("any")
  const [sort, setSort] = useState<Sort>("smart")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // page shortcuts: L = list, B = board
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog],[role=menu]")) return
      if (e.key === "l") setView("list")
      if (e.key === "b") setView("board")
      if (e.key === "Escape") setSelected(new Set())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setView])

  const byId = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks])
  const freeMinutes = totalFree(blocks, Math.max(prefs.dayStartMin, nowMin), prefs.dayEndMin)
  const allTags = useMemo(() => [...new Set(data.tasks.flatMap((t) => t.tags))].sort(), [data.tasks])

  const passesFacets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (t: Task) =>
      (area === "any" || t.area === area) &&
      (priority === "any" || t.priority === priority) &&
      (tag === "any" || t.tags.includes(tag)) &&
      (!q || `${t.title} ${t.notes} ${t.tags.join(" ")}`.toLowerCase().includes(q))
  }, [query, area, priority, tag])

  const inView = useMemo(
    () => (t: Task) => {
      const b = dueBucket(t, today)
      switch (filter) {
        case "open":
          return b !== "done"
        case "today":
          return b === "today" || b === "overdue"
        default:
          return b === filter
      }
    },
    [filter, today],
  )

  const filtered = useMemo(() => {
    const list = data.tasks.filter((t) => inView(t) && passesFacets(t))
    if (filter === "done") return list.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    const ctx = { today, freeMinutes, all: data.tasks }
    const scores = sort === "smart" ? new Map(list.map((t) => [t.id, scoreTask(t, ctx, byId).score])) : null
    return list.sort((a, b) => {
      switch (sort) {
        case "smart":
          return scores!.get(b.id)! - scores!.get(a.id)! || a.order - b.order
        case "due":
          return compareByDue(a, b)
        case "priority":
          return compareByPriority(a, b)
        case "manual":
          return a.order - b.order
        case "created":
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
  }, [data.tasks, inView, passesFacets, filter, sort, today, freeMinutes, byId])

  // the board keeps recently finished work visible in its Done column
  const boardTasks = useMemo(() => {
    if (filter === "done") return filtered
    const weekAgo = addDays(today, -7)
    return data.tasks.filter(
      (t) => passesFacets(t) && (t.status !== "done" ? inView(t) : !!t.completedAt && daysBetween(weekAgo, toISODate(new Date(t.completedAt))) >= 0),
    )
  }, [data.tasks, filtered, filter, inView, passesFacets, today])

  const recs = useMemo(() => recommendTasks(data.tasks, { today, freeMinutes }, 3), [data.tasks, today, freeMinutes])
  const counts = useMemo(() => {
    const c: Record<DueBucket, number> = { overdue: 0, today: 0, upcoming: 0, someday: 0, done: 0 }
    for (const t of data.tasks) c[dueBucket(t, today)]++
    return c
  }, [data.tasks, today])

  const toggleSelect = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && lastClicked) {
        const ids = filtered.map((t) => t.id)
        const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(id)].sort((x, y) => x - y)
        if (a >= 0 && b >= 0) for (const x of ids.slice(a, b + 1)) next.add(x)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastClicked(id)
  }

  const addToMyDay = async (task: Task) => {
    const from = Math.max(prefs.dayStartMin, roundUpTo(nowMin, 15))
    const duration = Math.min(120, Math.max(15, roundUpTo(task.estimateMin, 15)))
    const slot = freeSlots(blocks, from, prefs.dayEndMin).find((s) => s.end - s.start >= duration)
    if (!slot) {
      toast.error("No free gap that long left today", { description: "Open My Day to fit it in manually." })
      return
    }
    const block = await attempt(() => createBlock({ date: today, start: slot.start, end: slot.start + duration, title: task.title, kind: duration >= 45 ? "focus" : "task", taskId: task.id }))
    if (block) toast.success(`Scheduled at ${formatClock(slot.start)}`, { description: task.title })
  }

  const grouped = sort !== "manual" && sort !== "smart" && filter === "open"
  const groups: { bucket: DueBucket; tasks: Task[] }[] = grouped
    ? (["overdue", "today", "upcoming", "someday"] as DueBucket[]).map((bucket) => ({ bucket, tasks: filtered.filter((t) => dueBucket(t, today) === bucket) })).filter((g) => g.tasks.length)
    : []

  const anyFilter = query || area !== "any" || priority !== "any" || tag !== "any"
  const selecting = selected.size > 0

  return (
    <PageTransition>
      <PageHeader
        title="Tasks"
        description={`${counts.today + counts.overdue} due today${counts.overdue ? ` (${counts.overdue} overdue)` : ""} · ${counts.upcoming} upcoming · ${counts.someday} undated`}
        actions={
          <>
            <div className="flex rounded-control border border-line bg-surface p-1" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors", view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                <List className="size-4" /> List
              </button>
              <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")} className={cn("flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors", view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                <Columns3 className="size-4" /> Board
              </button>
            </div>
            <Button onClick={() => openTaskEditor(null, filter === "today" ? { dueDate: today } : undefined)}>
              <Plus /> New task <Kbd className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground">N</Kbd>
            </Button>
          </>
        }
      />

      {recs.length > 0 && <DoNext recs={recs} freeMinutes={freeMinutes} onSchedule={addToMyDay} />}

      <div className="mb-4 flex flex-col gap-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Task views">
          {VIEWS.map((v) => {
            const n = v.id === "open" ? data.tasks.length - counts.done : v.id === "today" ? counts.today + counts.overdue : v.id === "someday" ? counts.someday : counts[v.id as DueBucket]
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={filter === v.id}
                onClick={() => {
                  setFilter(v.id)
                  setSelected(new Set())
                }}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-control border px-3.5 py-1.5 text-sm transition-colors", filter === v.id ? "border-transparent bg-surface-3 text-foreground" : "border-line text-muted-backdrop on-backdrop hover:text-foreground")}
              >
                {v.label}
                <span className="text-xs text-muted-backdrop tabular">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, notes and tags"
              aria-label="Search tasks"
              className="h-10 w-full rounded-control border border-line bg-surface pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
          <Select value={area} onValueChange={(v) => setArea(v as Area | "any")}>
            <SelectTrigger className="h-10 w-36 rounded-full bg-surface" aria-label="Filter by area">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All areas</SelectItem>
              {AREAS.map((a) => (
                <SelectItem key={a} value={a}>
                  {AREA_META[a].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(priority)} onValueChange={(v) => setPriority(v === "any" ? "any" : (Number(v) as Priority))}>
            <SelectTrigger className="h-10 w-36 rounded-full bg-surface" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any priority</SelectItem>
              {([1, 2, 3, 4] as Priority[]).map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-10 w-36 rounded-full bg-surface" aria-label="Filter by tag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any tag</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    #{t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {view === "list" && filter !== "done" && (
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-10 w-40 rounded-full bg-surface" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">Sort: Smart</SelectItem>
                <SelectItem value="due">Sort: Due date</SelectItem>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="manual">Sort: Manual (drag)</SelectItem>
                <SelectItem value="created">Sort: Newest</SelectItem>
              </SelectContent>
            </Select>
          )}
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("")
                setArea("any")
                setPriority("any")
                setTag("any")
              }}
            >
              <X /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <TaskBoard tasks={boardTasks} today={today} byId={byId} />
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={filter === "done" ? Check : SquareCheckBig}
            title={anyFilter ? "No tasks match these filters" : filter === "done" ? "Nothing completed yet" : filter === "overdue" ? "Nothing overdue" : "No tasks here"}
            body={anyFilter ? "Try clearing a filter." : filter === "open" ? "Capture what's on your mind. Press Q for quick capture." : undefined}
            action={
              !anyFilter && filter !== "done" ? (
                <Button size="sm" onClick={() => openTaskEditor(null, filter === "today" ? { dueDate: today } : undefined)}>
                  <Plus /> New task
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : sort === "manual" && filter !== "done" ? (
        <Panel className="p-2 sm:p-3">
          <ManualList tasks={filtered} today={today} byId={byId} selected={selected} selecting={selecting} onSelect={toggleSelect} />
        </Panel>
      ) : grouped ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <Panel key={g.bucket} className="p-2 sm:p-3">
              <h2 className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {g.bucket === "overdue" && <span className="size-1.5 rounded-full bg-rose" />}
                {BUCKET_LABEL[g.bucket]} <span className="tabular">{g.tasks.length}</span>
              </h2>
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} blockedBy={blockingTasks(t, byId)} selected={selected.has(t.id)} selecting={selecting} onSelect={(s) => toggleSelect(t.id, s)} />
              ))}
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="p-2 sm:p-3">
          {filtered.map((t) => (
            <TaskRow key={t.id} task={t} today={today} blockedBy={blockingTasks(t, byId)} selected={selected.has(t.id)} selecting={selecting} onSelect={(s) => toggleSelect(t.id, s)} />
          ))}
        </Panel>
      )}

      {selecting && <BulkBar ids={[...selected]} today={today} onClear={() => setSelected(new Set())} onSelectAll={() => setSelected(new Set(filtered.map((t) => t.id)))} total={filtered.length} />}
    </PageTransition>
  )
}

function DoNext({ recs, freeMinutes, onSchedule }: { recs: Recommendation[]; freeMinutes: number; onSchedule: (t: Task) => void }) {
  const [open, setOpen] = useState(true)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  return (
    <Panel className="mb-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <span className="grid size-9 place-items-center rounded-full bg-violet text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Do next</span>
          <span className="text-xs text-muted-foreground">Ranked by priority and deadlines · {formatDuration(freeMinutes)} free today</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <motion.ol initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-2 @3xl:grid-cols-3">
          {recs.map((r, i) => (
            <li key={r.task.id} className="flex flex-col rounded-2xl border border-line bg-surface-2/50 p-3">
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-muted-foreground tabular">{String(i + 1).padStart(2, "0")}</span>
                <button type="button" onClick={() => openTaskEditor(r.task.id)} className="min-w-0 flex-1 text-left text-sm font-medium hover:underline">
                  {r.task.title}
                </button>
              </div>
              <ul className="mt-2 flex-1 space-y-0.5 text-xs text-muted-foreground">
                {r.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
              <Button size="xs" variant="outline" className="mt-3 self-start" onClick={() => onSchedule(r.task)}>
                <CalendarPlus /> Add to My Day
              </Button>
            </li>
          ))}
        </motion.ol>
      )}
    </Panel>
  )
}

function SortableRow(props: { task: Task; today: string; byId: Map<string, Task>; selected: boolean; selecting: boolean; onSelect: (shift: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-80")}>
      <TaskRow
        task={props.task}
        today={props.today}
        blockedBy={blockingTasks(props.task, props.byId)}
        selected={props.selected}
        selecting={props.selecting}
        onSelect={props.onSelect}
        dragHandle={<DragHandle {...attributes} {...listeners} />}
      />
    </div>
  )
}

function ManualList({ tasks, today, byId, selected, selecting, onSelect }: { tasks: Task[]; today: string; byId: Map<string, Task>; selected: Set<string>; selecting: boolean; onSelect: (id: string, shift: boolean) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = tasks.map((t) => t.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    // keep the visible block in place: reuse the existing order values, just re-assigned
    const orders = tasks.map((t) => t.order).sort((a, b) => a - b)
    void attempt(() => reorderTasks(next.map((id, i) => ({ id, order: orders[i] ?? i }))))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((t) => (
          <SortableRow key={t.id} task={t} today={today} byId={byId} selected={selected.has(t.id)} selecting={selecting} onSelect={(s) => onSelect(t.id, s)} />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function BulkBar({ ids, today, total, onClear, onSelectAll }: { ids: string[]; today: string; total: number; onClear: () => void; onSelectAll: () => void }) {
  const setStatus = async (status: TaskStatus) => {
    const blocked = await attempt(() => bulkSetStatus(ids, status))
    if (blocked === undefined) return
    if (blocked.length) toast.error(`${blocked.length} task${blocked.length > 1 ? "s are" : " is"} waiting on prerequisites`, { description: blocked.slice(0, 3).join(", ") })
    else toast.success(`Updated ${ids.length} task${ids.length > 1 ? "s" : ""}`)
    onClear()
  }
  const patch = async (p: Parameters<typeof bulkUpdateTasks>[1], label: string) => {
    if (await succeeded(() => bulkUpdateTasks(ids, p))) toast.success(`${label} · ${ids.length} task${ids.length > 1 ? "s" : ""}`)
  }
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 bottom-5 z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-control border border-line bg-popover/95 p-1.5 pl-4 shadow-2xl backdrop-blur-xl"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="mr-1 text-sm font-medium tabular">{ids.length} selected</span>
      {ids.length < total && (
        <Button size="sm" variant="ghost" onClick={onSelectAll}>
          All {total}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => void setStatus("done")}>
        <Check /> Complete
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <CalendarDays /> Due
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void patch({ dueDate: today }, "Due today")}>Today</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void patch({ dueDate: addDays(today, 1) }, "Due tomorrow")}>Tomorrow</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void patch({ dueDate: addDays(today, 7) }, "Due next week")}>Next week</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void patch({ dueDate: null }, "Date cleared")}>No date</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <Flag /> Priority
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {([1, 2, 3, 4] as Priority[]).map((p) => (
            <DropdownMenuItem key={p} onSelect={() => void patch({ priority: p }, `${PRIORITY_META[p].label} priority`)}>
              {PRIORITY_META[p].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void setStatus("todo")}>To do</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void setStatus("in_progress")}>In progress</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          void deleteWithUndo(ids)
          onClear()
        }}
      >
        <Trash2 /> Delete
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
        <X />
      </Button>
    </motion.div>
  )
}
