import { formatClock, roundUpTo } from "./dates"
import type { AccentColor, Block, BlockKind, Habit, ID, TimeOfDay } from "./types"
import type { Recommendation } from "./scheduling"

/** The colour each kind of time block is drawn in (timeline, calendar, sidebar). */
export const KIND_TONE: Record<BlockKind, AccentColor> = {
  event: "blue",
  task: "violet",
  focus: "cyan",
  break: "mint",
  routine: "amber",
  habit: "lilac",
}

export interface Slot {
  start: number
  end: number
}

/** How far through the day `nowMin` is: 0 until it starts, 1 once it's over. */
export function dayProgress(nowMin: number, startMin: number, endMin: number): number {
  if (endMin <= startMin) return 0
  return Math.min(1, Math.max(0, (nowMin - startMin) / (endMin - startMin)))
}

/** Ids of blocks that overlap at least one other block. */
export function findConflicts(blocks: Pick<Block, "id" | "start" | "end">[]): Set<ID> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const out = new Set<ID>()
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start >= sorted[i].end) break
      out.add(sorted[i].id)
      out.add(sorted[j].id)
    }
  }
  return out
}

/** Free gaps between `from` and `to` that no block covers. */
export function freeSlots(blocks: Pick<Block, "start" | "end">[], from: number, to: number): Slot[] {
  const busy = blocks
    .map((b) => ({ start: Math.max(b.start, from), end: Math.min(b.end, to) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)
  const slots: Slot[] = []
  let cursor = from
  for (const b of busy) {
    if (b.start > cursor) slots.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < to) slots.push({ start: cursor, end: to })
  return slots
}

export function totalFree(blocks: Pick<Block, "start" | "end">[], from: number, to: number) {
  return freeSlots(blocks, from, to).reduce((acc, s) => acc + (s.end - s.start), 0)
}

export interface PlanSuggestion {
  key: string
  title: string
  start: number
  end: number
  kind: BlockKind
  taskId: ID | null
  reason: string
}

export interface PlanInput {
  ranked: Recommendation[]
  existing: Pick<Block, "start" | "end" | "taskId">[]
  habitsDue: Habit[]
  dayStart: number
  dayEnd: number
  /** Planning never starts in the past: pass the current minute for today. */
  notBefore: number
  /** Long focus blocks get a short break after them. */
  breakMin?: number
}

export interface PlanResult {
  suggestions: PlanSuggestion[]
  unscheduled: { title: string; reason: string }[]
}

const HABIT_WINDOWS: Record<Exclude<TimeOfDay, "anytime">, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 23 * 60],
}

/**
 * Suggests time blocks for the free parts of a day. Existing blocks are never
 * moved or overwritten: suggestions only use time nobody has claimed yet.
 */
export function planDay(input: PlanInput): PlanResult {
  const breakMin = input.breakMin ?? 10
  const from = Math.max(input.dayStart, roundUpTo(input.notBefore, 15))
  const taken: Slot[] = input.existing.map((b) => ({ start: b.start, end: b.end }))
  const suggestions: PlanSuggestion[] = []
  const unscheduled: PlanResult["unscheduled"] = []
  const alreadyPlanned = new Set(input.existing.map((b) => b.taskId).filter(Boolean))

  const place = (duration: number, windowStart: number, windowEnd: number): Slot | null => {
    const slots = freeSlots(taken, Math.max(from, windowStart), Math.min(input.dayEnd, windowEnd))
    const fit = slots.find((s) => s.end - s.start >= duration)
    if (!fit) return null
    const slot = { start: fit.start, end: fit.start + duration }
    taken.push(slot)
    return slot
  }

  // 1. habit check-in blocks, grouped by preferred time of day
  for (const tod of ["morning", "afternoon", "evening"] as const) {
    const group = input.habitsDue.filter((h) => h.timeOfDay === tod)
    if (!group.length) continue
    const duration = Math.min(45, 10 + 5 * group.length)
    const [ws, we] = HABIT_WINDOWS[tod]
    const slot = place(duration, ws, we)
    if (slot) {
      suggestions.push({
        key: `habits-${tod}`,
        title: `${tod[0].toUpperCase()}${tod.slice(1)} habits: ${group.map((h) => h.name).join(", ")}`,
        start: slot.start,
        end: slot.end,
        kind: "habit",
        taskId: null,
        reason: `${group.length} habit${group.length > 1 ? "s" : ""} you prefer to do in the ${tod}`,
      })
    }
  }

  // 2. tasks in recommendation order
  for (const rec of input.ranked) {
    const t = rec.task
    if (alreadyPlanned.has(t.id)) continue
    const duration = Math.min(120, Math.max(15, roundUpTo(t.estimateMin || 30, 15)))
    const slot = place(duration, input.dayStart, input.dayEnd)
    if (!slot) {
      unscheduled.push({ title: t.title, reason: `No free ${duration}-minute gap left today` })
      continue
    }
    const deep = duration >= 45
    suggestions.push({
      key: `task-${t.id}`,
      title: deep ? `Focus: ${t.title}` : t.title,
      start: slot.start,
      end: slot.end,
      kind: deep ? "focus" : "task",
      taskId: t.id,
      reason: rec.reasons.slice(0, 2).join(" · ") || "Next in your queue",
    })
    if (t.estimateMin > 120) unscheduled.push({ title: t.title, reason: "Longer than 2 hours: the first 2 hours are scheduled" })

    if (deep) {
      const pause = place(breakMin, slot.end, slot.end + breakMin)
      if (pause) {
        suggestions.push({
          key: `break-${t.id}`,
          title: "Break",
          start: pause.start,
          end: pause.end,
          kind: "break",
          taskId: null,
          reason: `Recover after ${duration} minutes of deep work`,
        })
      }
    }
  }

  suggestions.sort((a, b) => a.start - b.start)
  return { suggestions, unscheduled }
}

export function describeSlot(s: Slot) {
  return `${formatClock(s.start)} – ${formatClock(s.end)}`
}

/** Side-by-side lanes for overlapping blocks. */
export function assignLanes<B extends Pick<Block, "id" | "start" | "end">>(blocks: B[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const lanes = new Map<string, { lane: number; of: number }>()
  let cluster: B[] = []
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
