"use client"

import { Check, GripHorizontal, MoreHorizontal, Pencil, Play, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useNow, usePrefs } from "@/lib/db/hooks"
import { createBlock, updateBlock } from "@/lib/db/repo"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { formatClock, formatDuration, snapTo } from "@/lib/domain/dates"
import { KIND_TONE, findConflicts } from "@/lib/domain/planner"
import type { Block, Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { toggleDone } from "@/features/tasks/task-actions"
import { KIND_LABEL, deleteBlockWithUndo, startFocusForBlock } from "./block-editor"

export const HOUR_PX = 64
const SNAP = 15
export const TASK_DRAG_TYPE = "application/x-life-task"

/** Side-by-side lanes for overlapping blocks. */
function assignLanes(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const lanes = new Map<string, { lane: number; of: number }>()
  let cluster: Block[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []
  const flush = () => {
    for (const b of cluster) lanes.set(b.id, { ...lanes.get(b.id)!, of: laneEnds.length })
    cluster = []
    laneEnds = []
  }
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= b.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(b.end)
    } else laneEnds[lane] = b.end
    lanes.set(b.id, { lane, of: 1 })
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  flush()
  return lanes
}

interface DragState {
  id: string
  mode: "move" | "resize"
  originY: number
  start: number
  end: number
  moved: boolean
}

export function Timeline({ date, isToday, blocks, tasksById }: { date: string; isToday: boolean; blocks: Block[]; tasksById: Map<string, Task> }) {
  const prefs = usePrefs()
  const router = useRouter()
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const surface = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const dayStart = prefs?.dayStartMin ?? 480
  const dayEnd = prefs?.dayEndMin ?? 1320
  const firstHour = Math.floor(Math.min(dayStart, ...blocks.map((b) => b.start)) / 60)
  const lastHour = Math.ceil(Math.max(dayEnd, ...blocks.map((b) => b.end)) / 60)
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const top = (min: number) => ((min - firstHour * 60) / 60) * HOUR_PX

  const conflicts = useMemo(() => findConflicts(blocks), [blocks])
  const lanes = useMemo(() => assignLanes(blocks), [blocks])

  const minuteAt = (clientY: number) => {
    const rect = surface.current!.getBoundingClientRect()
    return firstHour * 60 + ((clientY - rect.top) / HOUR_PX) * 60
  }

  const beginDrag = (e: ReactPointerEvent, block: Block, mode: DragState["mode"]) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id: block.id, mode, originY: e.clientY, start: block.start, end: block.end, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const block = blocks.find((b) => b.id === drag.id)
    if (!block) return
    const delta = snapTo(((e.clientY - drag.originY) / HOUR_PX) * 60, SNAP)
    if (drag.mode === "move") {
      const len = block.end - block.start
      const start = Math.max(0, Math.min(24 * 60 - len, block.start + delta))
      setDrag({ ...drag, start, end: start + len, moved: drag.moved || delta !== 0 })
    } else {
      const end = Math.max(block.start + SNAP, Math.min(24 * 60, block.end + delta))
      setDrag({ ...drag, end, moved: drag.moved || delta !== 0 })
    }
  }

  const endDrag = async () => {
    if (!drag) return
    const d = drag
    setDrag(null)
    const block = blocks.find((b) => b.id === d.id)
    if (!block) return
    if (!d.moved) {
      openBlockEditor({ blockId: block.id })
      return
    }
    if (d.start === block.start && d.end === block.end) return
    const prev = { start: block.start, end: block.end }
    const ok = await attempt(() => updateBlock(block.id, { start: d.start, end: d.end }))
    if (ok) {
      toast(`${block.title} · ${formatClock(d.start)}–${formatClock(d.end)}`, {
        action: { label: "Undo", onClick: () => void attempt(() => updateBlock(block.id, prev)) },
      })
    }
  }

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    const start = Math.max(0, Math.min(23 * 60, snapTo(minuteAt(e.clientY) - 15, SNAP)))
    openBlockEditor({ date, start })
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropAt(null)
    const taskId = e.dataTransfer.getData(TASK_DRAG_TYPE)
    const task = tasksById.get(taskId)
    if (!task) return
    const start = Math.max(0, snapTo(minuteAt(e.clientY), SNAP))
    const len = Math.min(180, Math.max(SNAP, snapTo(task.estimateMin, SNAP)))
    const end = Math.min(24 * 60, start + len)
    const block = await attempt(() => createBlock({ date, start, end, title: task.title, kind: len >= 45 ? "focus" : "task", taskId: task.id }))
    if (block) toast.success(`Scheduled "${task.title}" at ${formatClock(start)}`)
  }

  return (
    <div>
      {conflicts.size > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs" role="status">
          <TriangleAlert className="size-3.5 shrink-0 text-amber" />
          {conflicts.size} blocks overlap. They&apos;re shown side by side; drag one to resolve it.
        </p>
      )}
      <div className="relative flex select-none">
        <div className="w-14 shrink-0" aria-hidden>
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_PX }} className="relative">
              <span className="absolute -top-2 right-3 text-[11px] text-muted-foreground tabular">{formatClock(h * 60).replace(":00", "")}</span>
            </div>
          ))}
        </div>
        <div
          ref={surface}
          role="grid"
          aria-label={`Timeline for ${date}. Click an empty slot to add a block.`}
          className="relative flex-1 cursor-copy border-l border-line"
          style={{ height: hours.length * HOUR_PX }}
          onClick={onSurfaceClick}
          onPointerMove={onPointerMove}
          onPointerUp={() => void endDrag()}
          onPointerCancel={() => setDrag(null)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setDropAt(snapTo(minuteAt(e.clientY), SNAP))
          }}
          onDragLeave={() => setDropAt(null)}
          onDrop={(e) => void onDrop(e)}
        >
          {hours.map((h, i) => (
            <div key={h} className={cn("pointer-events-none absolute inset-x-0 border-t", i === 0 ? "border-transparent" : "border-line")} style={{ top: i * HOUR_PX }} />
          ))}
          {/* outside-day shading */}
          <div className="pointer-events-none absolute inset-x-0 hatch opacity-60" style={{ top: 0, height: Math.max(0, top(dayStart)) }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hatch opacity-60" style={{ top: top(dayEnd) }} />

          {isToday && nowMin >= firstHour * 60 && nowMin <= lastHour * 60 && (
            <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: top(nowMin) }} aria-label={`Now, ${formatClock(nowMin)}`}>
              <div className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-rose" />
              <div className="h-px bg-rose" />
            </div>
          )}

          {dropAt !== null && (
            <div className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-violet bg-violet/10 px-2 text-[11px] font-medium" style={{ top: top(dropAt), height: HOUR_PX / 2 }}>
              Drop at {formatClock(dropAt)}
            </div>
          )}

          {blocks.map((b) => {
            const live = drag?.id === b.id ? { start: drag.start, end: drag.end } : { start: b.start, end: b.end }
            const lane = lanes.get(b.id) ?? { lane: 0, of: 1 }
            const tone = ACCENT_CLASSES[KIND_TONE[b.kind]]
            const task = b.taskId ? tasksById.get(b.taskId) : undefined
            // true to scale: a 10-minute block is short, it just gets a one-line style
            const height = Math.max(14, ((live.end - live.start) / 60) * HOUR_PX - 2)
            const compact = height < 44
            const tiny = height < 26
            const past = isToday && live.end <= nowMin
            return (
              <div
                key={b.id}
                className={cn(
                  "group absolute z-10 overflow-hidden border-l-[3px] px-2.5 text-left shadow-sm backdrop-blur-sm transition-[box-shadow,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tiny ? "rounded-md py-0 text-[11px]" : "rounded-xl py-1.5",
                  tone.soft,
                  drag?.id === b.id ? "z-30 cursor-grabbing shadow-xl ring-2 ring-violet/50" : "cursor-grab hover:shadow-md",
                  conflicts.has(b.id) && "ring-1 ring-amber/60",
                  past && "opacity-60",
                )}
                style={{
                  top: top(live.start) + 1,
                  height,
                  left: `calc(${(lane.lane / lane.of) * 100}% + 4px)`,
                  width: `calc(${100 / lane.of}% - 8px)`,
                  borderLeftColor: tone.fill,
                }}
                onPointerDown={(e) => beginDrag(e, b, "move")}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === "Enter") openBlockEditor({ blockId: b.id })
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault()
                    const d = e.key === "ArrowUp" ? -SNAP : SNAP
                    // Shift+arrows resize, plain arrows move
                    const next = e.shiftKey ? { start: b.start, end: Math.max(b.start + SNAP, Math.min(24 * 60, b.end + d)) } : { start: b.start + d, end: b.end + d }
                    if (next.start >= 0 && next.end <= 24 * 60) void attempt(() => updateBlock(b.id, next))
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${b.title}, ${formatClock(live.start)} to ${formatClock(live.end)}, ${KIND_LABEL[b.kind]}${conflicts.has(b.id) ? ", overlaps another block" : ""}. Enter to edit, arrow keys to move, Shift and arrows to resize.`}
              >
                <div className={cn("flex gap-2", compact ? "items-center" : "items-start", tiny && "h-full")}>
                  {task && (
                    <button
                      type="button"
                      aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleDone(task)
                      }}
                      className={cn("grid shrink-0 place-items-center rounded-full border", tiny ? "size-3" : "size-4", task.status === "done" ? "border-transparent bg-mint text-primary-foreground" : "border-foreground/40")}
                    >
                      {task.status === "done" && <Check className="size-3" strokeWidth={3} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate leading-tight font-semibold", tiny ? "text-[11px]" : "text-[13px]", task && "strike", task?.status === "done" && "is-done")}>{b.title}</p>
                    {!compact && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular">
                        {formatClock(live.start)}–{formatClock(live.end)} · {formatDuration(live.end - live.start)}
                        {b.source === "plan" && " · planned"}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} aria-label={`Actions for ${b.title}`} className="grid size-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-foreground/10">
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openBlockEditor({ blockId: b.id })}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      {(b.kind === "focus" || b.kind === "task") && (
                        <DropdownMenuItem onSelect={() => startFocusForBlock(b, prefs?.focus.focusMin ?? 25, router.push)}>
                          <Play /> Start focus
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => void deleteBlockWithUndo(b.id)}>
                        <Trash2 /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {height >= 28 && (
                  <div
                    className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize items-center justify-center opacity-0 group-hover:opacity-100"
                    onPointerDown={(e) => beginDrag(e, b, "resize")}
                    aria-hidden
                  >
                    <GripHorizontal className="size-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
