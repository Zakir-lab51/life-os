"use client"

import { Check, ChevronDown, ChevronUp, GripHorizontal, Pencil, Play, Repeat, Trash2, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { toast } from "sonner"
import { useNow, usePrefs } from "@/lib/db/hooks"
import { updateBlock } from "@/lib/db/repo"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { formatClock, formatDuration, snapTo } from "@/lib/domain/dates"
import { KIND_TONE, findConflicts } from "@/lib/domain/planner"
import type { Block, Task } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { toggleDone } from "@/features/tasks/task-actions"
import { KIND_LABEL, deleteBlockWithUndo, startFocusForBlock } from "./block-editor"
import { useCentredCard } from "./centred-card"
import { QuickCreate, addBlock } from "./quick-create"

export const HOUR_PX = 64
const SNAP = 15
const DAY = 24 * 60
const HOLD = 280 // ms a finger rests before a touch drag starts (shorter than that, it scrolls)
const SLOP = 8 // px a finger may wander and still count as resting
export const TASK_DRAG_TYPE = "application/x-life-task"

const floorTo = (min: number) => Math.floor(min / SNAP) * SNAP
const ceilTo = (min: number) => Math.ceil(min / SNAP) * SNAP
/** How long a task's block is: its estimate, on the 15-minute grid, between 15 minutes and 3 hours. */
export const taskLength = (t: Task) => Math.min(180, Math.max(SNAP, snapTo(t.estimateMin, SNAP)))

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

/** A press on the timeline that may become a tap, a drawn block, a placement or a block drag. */
interface Press {
  pointerId: number
  touch: boolean
  y: number
  /** what the press is on: empty time (draw a block, or place the chosen task), or a block */
  on: "time" | "block"
  origin: number
  block?: Block
  el?: HTMLElement
  active: boolean
  timer?: ReturnType<typeof setTimeout>
}

/*
  The day's timeline. Making a block feels like drawing one:
  - press on empty time and drag down (on touch: rest a finger, then drag) to set its length;
    a plain tap makes a 30-minute block; either way a small card asks for the title (QuickCreate);
  - with a task chosen from "To schedule" (`placing`), a tap puts it there at its estimate;
  - tasks can also be dragged in from the list with a mouse.
  Blocks: tap to select one and get its toolbar (done, focus, earlier/later, shorter/longer,
  edit, remove); drag to move (on touch: rest a finger first, so swiping still scrolls), drag
  its bottom edge to resize. With the keyboard: Enter edits, arrows move, Shift+arrows resize.
*/
export function Timeline({
  date,
  isToday,
  blocks,
  tasksById,
  suggestions,
  placing,
  onPlaced,
}: {
  date: string
  isToday: boolean
  blocks: Block[]
  tasksById: Map<string, Task>
  /** tasks waiting for a time, offered in the new-block card */
  suggestions: Task[]
  /** a task chosen to be placed with a tap */
  placing: Task | null
  onPlaced: () => void
}) {
  const prefs = usePrefs()
  const router = useRouter()
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const surface = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const scrollLock = useRef(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draft, setDraft] = useState<{ start: number; end: number; open: boolean } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const dayStart = prefs?.dayStartMin ?? 480
  const dayEnd = prefs?.dayEndMin ?? 1320
  const firstHour = Math.floor(Math.min(dayStart, ...blocks.map((b) => b.start)) / 60)
  const lastHour = Math.ceil(Math.max(dayEnd, ...blocks.map((b) => b.end)) / 60)
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const height = hours.length * HOUR_PX
  const top = (min: number) => ((min - firstHour * 60) / 60) * HOUR_PX

  const conflicts = useMemo(() => findConflicts(blocks), [blocks])
  const lanes = useMemo(() => assignLanes(blocks), [blocks])
  const selectedBlock = blocks.find((b) => b.id === selected) ?? null
  const selectedLane = (selectedBlock && lanes.get(selectedBlock.id)) || { lane: 0, of: 1 }

  const minuteAt = (clientY: number) => {
    const rect = surface.current!.getBoundingClientRect()
    return firstHour * 60 + ((clientY - rect.top) / HOUR_PX) * 60
  }

  // a finger that started a drag mustn't scroll the page as it moves
  useEffect(() => {
    const el = surface.current
    if (!el) return
    const hold = (e: TouchEvent) => {
      if (scrollLock.current) e.preventDefault()
    }
    el.addEventListener("touchmove", hold, { passive: false })
    return () => el.removeEventListener("touchmove", hold)
  }, [])

  // Escape lets go of a selected block
  useEffect(() => {
    if (!selected) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [selected])

  const closeDraft = useCallback(() => setDraft(null), [])

  // the new block waiting for its title: drag its top or bottom edge to change when it starts
  // or ends, or its middle to move it, while the card stays open
  const draftEdit = useRef<{ mode: "start" | "end" | "move"; pointerId: number; y: number; start: number; end: number } | null>(null)
  const onDraftDown = (e: ReactPointerEvent<HTMLElement>, mode: "start" | "end" | "move") => {
    if (!draft || e.button !== 0) return
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the pointer has already lifted
    }
    draftEdit.current = { mode, pointerId: e.pointerId, y: e.clientY, start: draft.start, end: draft.end }
  }
  const onDraftMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = draftEdit.current
    if (!d || d.pointerId !== e.pointerId) return
    e.stopPropagation()
    const delta = snapTo(((e.clientY - d.y) / HOUR_PX) * 60, SNAP)
    const len = d.end - d.start
    const moved = Math.max(0, Math.min(DAY - len, d.start + delta))
    const next =
      d.mode === "end"
        ? { start: d.start, end: Math.max(d.start + SNAP, Math.min(DAY, d.end + delta)) }
        : d.mode === "start"
          ? { start: Math.max(0, Math.min(d.end - SNAP, d.start + delta)), end: d.end }
          : { start: moved, end: moved + len }
    setDraft((dr) => dr && { ...dr, ...next })
  }
  const onDraftUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (draftEdit.current?.pointerId !== e.pointerId) return
    e.stopPropagation()
    draftEdit.current = null
  }

  const endPress = () => {
    if (press.current?.timer) clearTimeout(press.current.timer)
    press.current = null
    scrollLock.current = false
  }

  const startBlockDrag = (block: Block, mode: DragState["mode"], y: number) => setDrag({ id: block.id, mode, originY: y, start: block.start, end: block.end, moved: false })

  const onBlockPointerDown = (e: ReactPointerEvent<HTMLElement>, block: Block, mode: DragState["mode"]) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = e.currentTarget
    if (e.pointerType !== "touch" || mode === "resize") {
      el.setPointerCapture(e.pointerId)
      if (e.pointerType === "touch") scrollLock.current = true
      startBlockDrag(block, mode, e.clientY)
      return
    }
    // a finger: a tap selects; resting it first starts a move
    const p: Press = { pointerId: e.pointerId, touch: true, y: e.clientY, on: "block", origin: block.start, block, el, active: false }
    p.timer = setTimeout(() => {
      p.active = true
      scrollLock.current = true
      try {
        el.setPointerCapture(p.pointerId)
      } catch {
        // the finger has already lifted
      }
      navigator.vibrate?.(8)
      setSelected(null)
      startBlockDrag(block, "move", p.y)
    }, HOLD)
    press.current = p
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    if (selected) {
      setSelected(null)
      return
    }
    if (draft?.open) return
    const p: Press = { pointerId: e.pointerId, touch: e.pointerType === "touch", y: e.clientY, on: "time", origin: floorTo(minuteAt(e.clientY)), active: false }
    if (p.touch && !placing) {
      p.timer = setTimeout(() => {
        p.active = true
        scrollLock.current = true
        navigator.vibrate?.(8)
        setDraft({ start: p.origin, end: Math.min(DAY, p.origin + SNAP), open: false })
      }, HOLD)
    }
    press.current = p
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (p && p.pointerId === e.pointerId && !p.active) {
      const dy = Math.abs(e.clientY - p.y)
      if (p.touch) {
        // moved before resting: it's a scroll, not a press
        if (dy > SLOP) endPress()
        return
      }
      if (p.on === "time" && !placing && dy >= 6) {
        p.active = true
        surface.current?.setPointerCapture(e.pointerId)
      } else return
    }
    if (p?.active && p.on === "time") {
      const at = minuteAt(e.clientY)
      const start = Math.max(0, Math.min(p.origin, floorTo(at)))
      const end = Math.min(DAY, Math.max(p.origin + SNAP, ceilTo(at)))
      setDraft({ start, end, open: false })
      return
    }
    if (drag) {
      const block = blocks.find((b) => b.id === drag.id)
      if (!block) return
      const delta = snapTo(((e.clientY - drag.originY) / HOUR_PX) * 60, SNAP)
      if (drag.mode === "move") {
        const len = block.end - block.start
        const start = Math.max(0, Math.min(DAY - len, block.start + delta))
        setDrag({ ...drag, start, end: start + len, moved: drag.moved || delta !== 0 })
      } else {
        const end = Math.max(block.start + SNAP, Math.min(DAY, block.end + delta))
        setDrag({ ...drag, end, moved: drag.moved || delta !== 0 })
      }
      return
    }
    if (placing && e.pointerType !== "touch" && e.target === e.currentTarget) setHoverAt(floorTo(minuteAt(e.clientY)))
  }

  const endDrag = async (d: DragState) => {
    setDrag(null)
    const block = blocks.find((b) => b.id === d.id)
    if (!block) return
    if (!d.moved) {
      setSelected(block.id)
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

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current
    const d = drag
    endPress()
    if (d) {
      void endDrag(d)
      return
    }
    if (!p || p.pointerId !== e.pointerId) return
    if (p.on === "block") {
      // a quick tap on a block selects it
      if (!p.active && p.block) setSelected(p.block.id)
      return
    }
    if (placing) {
      const task = placing
      const start = p.origin
      void addBlock({ date, start, end: Math.min(DAY, start + taskLength(task)), title: task.title, kind: taskLength(task) >= 45 ? "focus" : "task", taskId: task.id }).then((b) => {
        if (b) onPlaced()
      })
      setHoverAt(null)
      return
    }
    if (p.active) setDraft((dr) => dr && { ...dr, open: true })
    else setDraft({ start: p.origin, end: Math.min(DAY, p.origin + 30), open: true })
  }

  const onPointerCancel = () => {
    endPress()
    setDrag(null)
    setDraft((dr) => (dr?.open ? dr : null))
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropAt(null)
    const task = tasksById.get(e.dataTransfer.getData(TASK_DRAG_TYPE))
    if (!task) return
    const start = Math.max(0, floorTo(minuteAt(e.clientY)))
    await addBlock({ date, start, end: Math.min(DAY, start + taskLength(task)), title: task.title, kind: taskLength(task) >= 45 ? "focus" : "task", taskId: task.id })
  }

  // where a card goes: under the block it belongs to, or above it near the bottom of the day
  const below = (start: number, end: number, room: number): CSSProperties => (top(end) + room < height ? { top: top(end) + 6 } : { bottom: height - top(start) + 6 })

  return (
    <div>
      {conflicts.size > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs" role="status">
          <TriangleAlert className="size-3.5 shrink-0 text-amber" />
          {conflicts.size} blocks overlap. They&apos;re shown side by side; drag one to resolve it.
        </p>
      )}
      <div className="relative flex select-none [-webkit-touch-callout:none]">
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
          aria-label={`Timeline for ${date}. Drag over empty time, or tap it, to add a block.`}
          className={cn("relative flex-1 border-l border-line", placing ? "cursor-copy" : "cursor-crosshair")}
          style={{ height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => setHoverAt(null)}
          onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setDropAt(floorTo(minuteAt(e.clientY)))
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

          {/* where a dragged-in task, or the chosen one, would land */}
          {(dropAt !== null || (placing && hoverAt !== null)) && (
            <Ghost top={top((dropAt ?? hoverAt)!)} height={(placing ? taskLength(placing) : 30) / 60 * HOUR_PX} label={`${placing ? placing.title : "Drop"} · ${formatClock((dropAt ?? hoverAt)!)}`} />
          )}

          {/* the block being drawn, or waiting for its title */}
          {draft && !draft.open && <Ghost top={top(draft.start)} height={((draft.end - draft.start) / 60) * HOUR_PX} label={`${formatClock(draft.start)}–${formatClock(draft.end)} · ${formatDuration(draft.end - draft.start)}`} strong />}
          {draft?.open && (
            <div
              data-draft
              aria-hidden
              className="absolute inset-x-1 z-30 cursor-grab touch-none rounded-xl border-2 border-dashed border-violet bg-violet/20 px-2.5 py-1 text-[11px] font-semibold tabular active:cursor-grabbing"
              style={{ top: top(draft.start) + 1, height: Math.max(18, ((draft.end - draft.start) / 60) * HOUR_PX - 2) }}
              onPointerDown={(e) => onDraftDown(e, "move")}
              onPointerMove={onDraftMove}
              onPointerUp={onDraftUp}
              onPointerCancel={onDraftUp}
            >
              <p className="truncate">
                {formatClock(draft.start)}–{formatClock(draft.end)} · {formatDuration(draft.end - draft.start)}
              </p>
              {(["start", "end"] as const).map((edge) => (
                <span
                  key={edge}
                  className={cn("absolute inset-x-0 flex h-6 cursor-ns-resize justify-center", edge === "start" ? "-top-3 items-start" : "-bottom-3 items-end")}
                  onPointerDown={(e) => onDraftDown(e, edge)}
                >
                  <span className="mt-[9px] mb-[9px] h-1.5 w-8 rounded-full bg-violet shadow-sm" />
                </span>
              ))}
            </div>
          )}
          {draft?.open && (
            <QuickCreate
              date={date}
              start={draft.start}
              end={draft.end}
              tasks={suggestions}
              style={below(draft.start, draft.end, 300)}
              onResize={(end) => setDraft((dr) => dr && { ...dr, end })}
              onClose={closeDraft}
            />
          )}

          {blocks.map((b) => {
            const live = drag?.id === b.id ? { start: drag.start, end: drag.end } : { start: b.start, end: b.end }
            const lane = lanes.get(b.id) ?? { lane: 0, of: 1 }
            const tone = ACCENT_CLASSES[KIND_TONE[b.kind]]
            const task = b.taskId ? tasksById.get(b.taskId) : undefined
            // true to scale: a 10-minute block is short, it just gets a one-line style
            const blockHeight = Math.max(14, ((live.end - live.start) / 60) * HOUR_PX - 2)
            const compact = blockHeight < 44
            const tiny = blockHeight < 26
            const past = isToday && live.end <= nowMin
            const isSelected = selected === b.id
            return (
              <div
                key={b.id}
                className={cn(
                  "group absolute z-10 touch-manipulation border-l-[3px] px-2.5 text-left shadow-sm backdrop-blur-sm transition-[box-shadow,background-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tiny ? "rounded-md py-0 text-[11px]" : "rounded-xl py-1.5",
                  // past blocks lose their colour, not their legibility
                  past ? "bg-foreground/[0.05] text-muted-foreground" : tone.soft,
                  drag?.id === b.id ? "z-30 cursor-grabbing shadow-xl ring-2 ring-violet/50" : "cursor-grab hover:shadow-md",
                  isSelected && "z-20 shadow-lg ring-2 ring-foreground/40",
                  conflicts.has(b.id) && "ring-1 ring-amber/60",
                )}
                style={{
                  top: top(live.start) + 1,
                  height: blockHeight,
                  left: `calc(${(lane.lane / lane.of) * 100}% + 4px)`,
                  width: `calc(${100 / lane.of}% - 8px)`,
                  borderLeftColor: tone.fill,
                }}
                onPointerDown={(e) => onBlockPointerDown(e, b, "move")}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === "Enter") openBlockEditor({ blockId: b.id })
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault()
                    const d = e.key === "ArrowUp" ? -SNAP : SNAP
                    // Shift+arrows resize, plain arrows move
                    const next = e.shiftKey ? { start: b.start, end: Math.max(b.start + SNAP, Math.min(DAY, b.end + d)) } : { start: b.start + d, end: b.end + d }
                    if (next.start >= 0 && next.end <= DAY) void attempt(() => updateBlock(b.id, next))
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${b.title}, ${formatClock(live.start)} to ${formatClock(live.end)}, ${KIND_LABEL[b.kind]}${b.seriesId ? ", repeats" : ""}${conflicts.has(b.id) ? ", overlaps another block" : ""}. Enter to edit, arrow keys to move, Shift and arrows to resize.`}
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
                      // a 24 px target with a mouse, 44 px on touch (hit-area), even on a 15-minute block
                      className={cn("relative grid shrink-0 place-items-center rounded-full border hit-area pointer-fine:after:absolute pointer-fine:after:inset-[min(-4px,calc((100%-24px)/2))]", tiny ? "size-3" : "size-4", task.status === "done" ? "border-transparent bg-mint text-primary-foreground" : "border-foreground/40")}
                    >
                      {task.status === "done" && <Check className="size-3" strokeWidth={3} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate leading-tight font-semibold", tiny ? "text-[11px] leading-[13px]" : "text-[13px]", task && "strike", task?.status === "done" && "is-done")}>
                      {b.seriesId && !tiny && <Repeat aria-hidden className="mr-1 inline size-3 -translate-y-px text-muted-foreground" />}
                      <span className={cn(task && "strike-text")}>{b.title}</span>
                    </p>
                    {!compact && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular">
                        {formatClock(live.start)}–{formatClock(live.end)} · {formatDuration(live.end - live.start)}
                        {b.source === "plan" && " · planned"}
                      </p>
                    )}
                  </div>
                </div>
                {blockHeight >= 28 && (
                  <div
                    className={cn("absolute inset-x-0 bottom-0 flex cursor-ns-resize touch-none items-end justify-center", isSelected ? "h-4 opacity-100" : "h-2 opacity-0 pointer-fine:group-hover:opacity-100")}
                    onPointerDown={(e) => onBlockPointerDown(e, b, "resize")}
                    aria-hidden
                  >
                    <GripHorizontal className="size-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}

          {selectedBlock && !drag && (
            <BlockToolbar
              block={selectedBlock}
              task={selectedBlock.taskId ? tasksById.get(selectedBlock.taskId) : undefined}
              // centred under the block's lane; it may reach into the hour labels' gutter, so it fits on one line on a phone
              at={(selectedLane.lane + 0.5) / selectedLane.of}
              style={below(selectedBlock.start, selectedBlock.end, 64)}
              onEdit={() => {
                setSelected(null)
                openBlockEditor({ blockId: selectedBlock.id })
              }}
              onFocus={() => startFocusForBlock(selectedBlock, prefs?.focus.focusMin ?? 25, router.push)}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Ghost({ top, height, label, strong }: { top: number; height: number; label: string; strong?: boolean }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-x-1 z-30 overflow-hidden rounded-xl border-2 border-dashed border-violet px-2.5 py-1 text-[11px] font-semibold tabular", strong ? "bg-violet/20" : "bg-violet/10")}
      style={{ top: top + 1, height: Math.max(18, height - 2) }}
    >
      {label}
    </div>
  )
}

/** The selected block's actions, right under it. */
function BlockToolbar({ block, task, at, style, onEdit, onFocus, onClose }: { block: Block; task?: Task; at: number; style: CSSProperties; onEdit: () => void; onFocus: () => void; onClose: () => void }) {
  const bar = useRef<HTMLDivElement>(null)
  useCentredCard(bar, at)
  const shift = (ds: number, de: number) => {
    const next = { start: block.start + ds, end: block.end + de }
    if (next.start < 0 || next.end > DAY || next.end - next.start < SNAP) return
    void attempt(() => updateBlock(block.id, next))
  }
  const tool = "relative grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-1.5 text-xs font-semibold text-foreground/80 tabular outline-none hit-area hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
  // the dividers close up on the narrowest phones, so the toolbar keeps to one line there
  const divider = <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line max-[339px]:mx-0" />
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={`${block.title}: actions`}
      className="absolute z-40 flex w-max max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-0.5 rounded-2xl border border-line bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {task && (
        <button type="button" className={tool} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} title={task.status === "done" ? "Reopen" : "Done"} onClick={() => void toggleDone(task)}>
          <Check />
        </button>
      )}
      {(block.kind === "focus" || block.kind === "task") && (
        <button type="button" className={tool} aria-label="Start focus" title="Start focus" onClick={onFocus}>
          <Play />
        </button>
      )}
      {(task || block.kind === "focus" || block.kind === "task") && divider}
      <button type="button" className={tool} aria-label="15 minutes earlier" title="Earlier" onClick={() => shift(-SNAP, -SNAP)}>
        <ChevronUp />
      </button>
      <button type="button" className={tool} aria-label="15 minutes later" title="Later" onClick={() => shift(SNAP, SNAP)}>
        <ChevronDown />
      </button>
      {divider}
      <button type="button" className={tool} aria-label="15 minutes shorter" title="Shorter" onClick={() => shift(0, -SNAP)}>
        −15
      </button>
      <button type="button" className={tool} aria-label="15 minutes longer" title="Longer" onClick={() => shift(0, SNAP)}>
        +15
      </button>
      {divider}
      <button type="button" className={tool} aria-label="Edit" title="Edit" onClick={onEdit}>
        <Pencil />
      </button>
      <button
        type="button"
        className={cn(tool, "text-destructive hover:text-destructive")}
        aria-label="Remove"
        title="Remove"
        onClick={() => {
          onClose()
          void deleteBlockWithUndo(block.id)
        }}
      >
        <Trash2 />
      </button>
    </div>
  )
}
