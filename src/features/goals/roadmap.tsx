"use client"

import { CheckSquare, CornerLeftUp, Repeat } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Segmented } from "@/components/os/field"
import { AREA_META } from "@/lib/domain/areas"
import { addDays, daysBetween, formatDay, fromISODate, toISODate } from "@/lib/domain/dates"
import { HORIZON_META, type GoalEvaluation } from "@/lib/domain/goals"
import { isDueOn } from "@/lib/domain/habits"
import type { Goal, GoalHorizon } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"

/*
  Life Roadmap: goals as bars on a timeline, one lane per horizon (five years at the
  top, this week at the bottom). Fill shows progress, diamonds are milestones, and a
  line joins each goal to the bigger goal it serves. The last lane holds today's tasks
  and habits for those goals. Pointing at a goal or an action lights up its whole chain,
  from today's step up to the long-term ambition it serves, and dims everything else.
*/

type Range = "quarter" | "year" | "five"
const RANGES: Record<Range, { label: string; before: number; after: number }> = {
  quarter: { label: "3 months", before: 14, after: 90 },
  year: { label: "1 year", before: 30, after: 365 },
  five: { label: "5 years", before: 90, after: 5 * 365 },
}
const LANES: GoalHorizon[] = ["five-year", "year", "quarter", "month", "week"]
const LANE_LABEL: Record<GoalHorizon, string> = { "five-year": "Five years", year: "Years", quarter: "Quarters", month: "Months", week: "Weeks" }
const AXIS_H = 44
const ROW_H = 42
const BAR_H = 30
const LANE_PAD = 10
const LABEL_GAP = 8
const CHIP_W = 220
const CHIP_H = 46
const ACTIONS_GAP = 28
const MIN_W = 760

interface Bar {
  goal: Goal
  x0: number
  x1: number
  top: number
  clippedStart: boolean
  clippedEnd: boolean
  /** Where the title sits: inside the bar, or beside it when the bar is too short to hold it. */
  side: "in" | "right" | "left"
  labelW: number
}

interface Chip {
  key: string
  label: string
  kind: "task" | "habit"
  goalId: string
  taskId?: string
  left: number
  top: number
}

/** Rough width of a goal's title plus its percentage at 12px, used to decide where the label fits. */
const labelWidth = (title: string) => Math.min(240, Math.round(title.length * 6.3) + 44)

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function ticksFor(range: Range, from: string, to: string) {
  const out: { date: string; label: string; major: boolean }[] = []
  const start = fromISODate(from)
  if (range === "five") {
    for (let y = start.getFullYear(); ; y++) {
      for (let q = 0; q < 4; q++) {
        const d = toISODate(new Date(y, q * 3, 1))
        if (d > to) return out
        if (d >= from) out.push({ date: d, label: q === 0 ? String(y) : "", major: q === 0 })
      }
    }
  }
  for (let i = 0; ; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const d = toISODate(dt)
    if (d > to) return out
    if (d < from) continue
    const jan = dt.getMonth() === 0
    out.push({ date: d, label: jan ? formatDay(d, "MMM yyyy") : formatDay(d, "MMM"), major: jan })
  }
}

/** S-curve from a point on the top edge of one box up to a point on the bottom edge of another. */
const rise = (x0: number, y0: number, x1: number, y1: number) => {
  const bend = Math.min(26, Math.abs(y0 - y1) / 2)
  return `M${x0},${y0} C${x0},${y0 - bend} ${x1},${y1 + bend} ${x1},${y1}`
}

export function Roadmap({ life, evaluations }: { life: Life; evaluations: Map<string, GoalEvaluation> }) {
  const [range, setRange] = useState<Range>("year")
  const [hot, setHot] = useState<{ goalId: string; chip?: string } | null>(null)
  const [ref, measured] = useWidth<HTMLDivElement>()
  const showGoal = useUI((s) => s.showGoal)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const today = life.today
  const width = Math.max(measured, MIN_W)
  const from = addDays(today, -RANGES[range].before)
  const to = addDays(today, RANGES[range].after)
  const span = daysBetween(from, to)
  const x = (date: string) => (daysBetween(from, date) / span) * width

  const layout = useMemo(() => {
    const goals = life.data.goals.filter((g) => g.status !== "archived")
    const lanes: { horizon: GoalHorizon; top: number; height: number }[] = []
    const bars = new Map<string, Bar>()
    let top = AXIS_H
    for (const horizon of LANES) {
      const items = goals
        .filter((g) => g.horizon === horizon)
        .filter((g) => (g.dueDate ?? to) >= from && g.startDate <= to)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
      if (!items.length) continue
      const rowEnds: number[] = []
      const placed: Bar[] = []
      for (const g of items) {
        const startD = g.startDate < from ? from : g.startDate
        const endD = !g.dueDate || g.dueDate > to ? to : g.dueDate
        const x0 = x(startD)
        const x1 = Math.max(x0 + 30, x(endD))
        const labelW = labelWidth(g.title)
        const side = x1 - x0 >= labelW ? "in" : x1 + LABEL_GAP + labelW <= width ? "right" : "left"
        const reachStart = side === "left" ? x0 - LABEL_GAP - labelW : x0
        const reachEnd = side === "right" ? x1 + LABEL_GAP + labelW : x1
        let row = rowEnds.findIndex((end) => end + 8 <= reachStart)
        if (row === -1) row = rowEnds.push(0) - 1
        rowEnds[row] = reachEnd
        placed.push({ goal: g, x0, x1, top: top + LANE_PAD + row * ROW_H, clippedStart: g.startDate < from, clippedEnd: !g.dueDate || g.dueDate > to, side, labelW })
      }
      const height = rowEnds.length * ROW_H + LANE_PAD * 2 - (ROW_H - BAR_H)
      lanes.push({ horizon, top, height })
      for (const b of placed) bars.set(b.goal.id, b)
      top += height
    }

    // today's actions for these goals: open tasks due by today, and supporting habits not yet done today
    const doneToday = new Set(life.data.habitLogs.filter((l) => l.date === today).map((l) => l.habitId))
    const actions: Omit<Chip, "left" | "top">[] = []
    for (const t of life.data.tasks) {
      if (t.goalId && bars.has(t.goalId) && t.status !== "done" && t.dueDate && t.dueDate <= today) actions.push({ key: `t:${t.id}`, label: t.title, kind: "task", goalId: t.goalId, taskId: t.id })
    }
    for (const g of goals) {
      if (!bars.has(g.id) || g.status !== "active") continue
      const habitIds = new Set([...(g.measure.kind === "habit" ? [g.measure.habitId] : []), ...g.habitIds])
      for (const id of habitIds) {
        const h = life.data.habits.find((x) => x.id === id && !x.archivedAt)
        if (h && isDueOn(h, today) && !doneToday.has(h.id) && !actions.some((a) => a.key === `h:${h.id}`)) actions.push({ key: `h:${h.id}`, label: h.name, kind: "habit", goalId: g.id })
      }
    }
    const shown = actions.slice(0, 9)
    const perRow = Math.max(1, Math.floor((width - 16) / (CHIP_W + 8)))
    const actionTop = top + ACTIONS_GAP
    const chips: Chip[] = shown.map((a, i) => {
      const row = Math.floor(i / perRow)
      const inRow = Math.min(perRow, shown.length - row * perRow)
      const rowWidth = inRow * (CHIP_W + 8) - 8
      const start = Math.min(Math.max(8, x(today) - rowWidth / 2), width - rowWidth - 8)
      return { ...a, left: start + (i % perRow) * (CHIP_W + 8), top: actionTop + row * (CHIP_H + 8) }
    })
    const actionsHeight = shown.length ? ACTIONS_GAP + Math.ceil(shown.length / perRow) * (CHIP_H + 8) + 4 : 0
    return { lanes, bars, chips, height: top + (actionsHeight || 12), actionsTop: actionTop, hiddenActions: actions.length - shown.length }
    // x() only depends on these values
  }, [life, from, to, width, today]) // eslint-disable-line react-hooks/exhaustive-deps

  // the chain to light up: the goal, every bigger goal it serves, and (for a goal) the smaller goals serving it
  const lit = useMemo(() => {
    if (!hot) return null
    const ids = new Set<string>()
    for (let g = layout.bars.get(hot.goalId)?.goal; g && !ids.has(g.id); g = g.parentId ? layout.bars.get(g.parentId)?.goal : undefined) ids.add(g.id)
    if (!hot.chip) {
      const below = new Set([hot.goalId])
      for (let grew = true; grew; ) {
        grew = false
        for (const b of layout.bars.values()) {
          if (b.goal.parentId && below.has(b.goal.parentId) && !below.has(b.goal.id)) {
            below.add(b.goal.id)
            grew = true
          }
        }
      }
      for (const id of below) ids.add(id)
    }
    return ids
  }, [hot, layout])
  const chipLit = (c: Chip) => !lit || (hot?.chip ? hot.chip === c.key : lit.has(c.goalId))
  const point = (goalId: string, chip?: string) => ({
    onPointerEnter: () => setHot({ goalId, chip }),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot({ goalId, chip }),
    onBlur: () => setHot(null),
  })

  const ticks = ticksFor(range, from, to)
  const todayX = x(today)
  const rangePicker = <Segmented<Range> ariaLabel="Time range" value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: RANGES[r].label }))} />

  if (!layout.lanes.length) {
    return (
      <div className="glass rounded-panel p-10 text-center">
        <p className="font-medium">Nothing on the roadmap in this range</p>
        <p className="mt-1 text-sm text-muted-foreground">Goals appear here once they have a start date in view. Try a longer range.</p>
        <div className="mt-4 flex justify-center">{rangePicker}</div>
      </div>
    )
  }

  const links = [...layout.bars.values()].flatMap((b) => {
    const p = b.goal.parentId ? layout.bars.get(b.goal.parentId) : undefined
    if (!p) return []
    const cx = Math.min(Math.max(b.x0 + 14, p.x0 + 14), b.x1 - 10)
    const px = Math.min(Math.max(cx, p.x0 + 14), p.x1 - 14)
    return [{ id: b.goal.id, d: rise(cx, b.top, px, p.top + BAR_H), color: AREA_META[b.goal.area].color, on: !!lit?.has(b.goal.id) && lit.has(p.goal.id) }]
  })
  const hotChip = hot?.chip ? layout.chips.find((c) => c.key === hot.chip) : undefined
  const hotChipGoal = hotChip ? layout.bars.get(hotChip.goalId) : undefined

  return (
    <section className="glass rounded-panel p-4 sm:p-5" aria-label="Life Roadmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Fill shows progress · ◆ milestones · point at a goal or action to trace the bigger goals it serves</p>
        {rangePicker}
      </div>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
        {/* lane labels */}
        <div className="relative" style={{ height: layout.height }}>
          {layout.lanes.map((l) => (
            <div key={l.horizon} className="absolute inset-x-0 pt-[17px] text-[11px] leading-none font-semibold tracking-[0.06em] text-muted-foreground uppercase" style={{ top: l.top, height: l.height }}>
              {LANE_LABEL[l.horizon]}
            </div>
          ))}
          {layout.chips.length > 0 && (
            <div className="absolute inset-x-0 pt-[18px] text-[11px] leading-none font-semibold tracking-[0.06em] text-violet uppercase" style={{ top: layout.actionsTop }}>
              Today
            </div>
          )}
        </div>

        {/* timeline */}
        <div ref={ref} className="no-scrollbar overflow-x-auto">
          <div className="relative" style={{ width, height: layout.height }}>
            {/* lane bands and month/year grid */}
            {layout.lanes.map((l, i) => (
              <div key={l.horizon} aria-hidden className={cn("absolute inset-x-0 rounded-xl", i % 2 === 0 && "bg-foreground/[0.025]")} style={{ top: l.top, height: l.height }} />
            ))}
            {ticks.map((t) => (
              <div key={t.date} aria-hidden className="absolute top-0 bottom-0" style={{ left: x(t.date) }}>
                <div className={cn("h-full w-px", t.major ? "bg-foreground/15" : "bg-foreground/[0.06]")} />
                {t.label && <span className={cn("absolute top-1 left-1.5 text-[11px] whitespace-nowrap", t.major ? "font-semibold text-foreground/80" : "text-muted-foreground")}>{t.label}</span>}
              </div>
            ))}

            {/* goal → bigger goal, behind the bars */}
            <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={layout.height}>
              {links.map((l) => (
                <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth="1.5" strokeOpacity={lit ? 0.12 : 0.5} className="transition-[stroke-opacity] duration-300" />
              ))}
            </svg>

            {/* today */}
            <div aria-hidden className="absolute top-0 bottom-0 w-0.5 rounded-full bg-violet/70" style={{ left: todayX - 1 }}>
              <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-violet px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white" style={{ top: 22 }}>
                Today
              </span>
            </div>

            {/* goals */}
            {[...layout.bars.values()].map((b) => {
              const e = evaluations.get(b.goal.id)
              const ratio = e?.progress.ratio ?? 0
              const color = AREA_META[b.goal.area].color
              const done = b.goal.status === "done"
              const w = b.x1 - b.x0
              const pct = `${Math.round(ratio * 100)}%`
              const outside = b.side !== "in"
              const on = lit?.has(b.goal.id)
              return (
                <button
                  key={b.goal.id}
                  type="button"
                  onClick={() => showGoal(b.goal.id)}
                  {...point(b.goal.id)}
                  title={b.goal.title}
                  aria-label={`${b.goal.title}. ${HORIZON_META[b.goal.horizon].adjective} goal, ${pct} done${b.goal.dueDate ? `, due ${formatDay(b.goal.dueDate, "d MMM yyyy")}` : ""}`}
                  className={cn(
                    // pressable already eases opacity alongside the press scale
                    "pressable absolute flex items-center rounded-full text-left outline-none [--press-scale:0.98] focus-visible:ring-2 focus-visible:ring-ring",
                    b.side === "left" && "flex-row-reverse",
                    lit ? (on ? "z-10" : "opacity-25") : done && "opacity-75",
                  )}
                  style={{ left: b.side === "left" ? b.x0 - LABEL_GAP - b.labelW : b.x0, width: outside ? w + LABEL_GAP + b.labelW : w, top: b.top, height: BAR_H, gap: LABEL_GAP }}
                >
                  <span
                    className={cn("relative h-full shrink-0 overflow-hidden rounded-full transition-shadow duration-300", on ? "ring-2" : "ring-1", b.clippedStart && "rounded-l-md", b.clippedEnd && "rounded-r-md")}
                    style={{ width: w, background: `color-mix(in oklch, ${color} 14%, var(--surface))`, ["--tw-ring-color" as string]: `color-mix(in oklch, ${color} ${on ? 90 : 45}%, transparent)`, boxShadow: on ? `0 0 18px -2px color-mix(in oklch, ${color} 55%, transparent)` : undefined }}
                  >
                    <span aria-hidden className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-(--ease-out)" style={{ width: pct, background: `color-mix(in oklch, ${color} ${done ? 55 : 40}%, transparent)` }} />
                    {b.goal.milestones.map((m) => {
                      if (!m.due || m.due < b.goal.startDate) return null
                      const mx = x(m.due) - b.x0
                      if (mx < 6 || mx > w - 6) return null
                      return <span key={m.id} aria-hidden className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] ring-1", m.doneAt ? "bg-foreground/80 ring-foreground/80" : "bg-surface ring-foreground/50")} style={{ left: mx }} />
                    })}
                    {!outside && (
                      <span className="relative flex h-full items-center gap-2 px-3 text-xs font-medium whitespace-nowrap">
                        <span className="truncate">{b.goal.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular">{pct}</span>
                      </span>
                    )}
                  </span>
                  {outside && (
                    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap", b.side === "left" && "justify-end")} style={{ width: b.labelW }}>
                      <span className="truncate">{b.goal.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular">{pct}</span>
                    </span>
                  )}
                </button>
              )
            })}

            {/* the lit chain, drawn over the bars */}
            {lit && (
              <svg aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-visible" width={width} height={layout.height}>
                {links
                  .filter((l) => l.on)
                  .map((l) => (
                    <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinecap="round" />
                  ))}
                {hotChip && hotChipGoal && (
                  <path
                    d={rise(Math.min(Math.max(hotChip.left + 18, hotChipGoal.x0 + 12), hotChip.left + CHIP_W - 18), hotChip.top, Math.min(Math.max(hotChip.left + 18, hotChipGoal.x0 + 12), Math.max(hotChipGoal.x0 + 12, hotChipGoal.x1 - 12)), hotChipGoal.top + BAR_H)}
                    fill="none"
                    stroke="var(--violet)"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            )}

            {/* today's actions */}
            {layout.chips.map((c) => {
              const goal = layout.bars.get(c.goalId)!.goal
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => (c.taskId ? openTaskEditor(c.taskId) : showGoal(c.goalId))}
                  {...point(c.goalId, c.key)}
                  className={cn("pressable glass absolute z-30 flex flex-col justify-center gap-0.5 rounded-2xl px-3 text-left [--press-scale:0.97]", !chipLit(c) && "opacity-30")}
                  style={{ left: c.left, top: c.top, width: CHIP_W, height: CHIP_H }}
                  aria-label={`${c.kind === "task" ? "Task" : "Habit"}: ${c.label}. Moves ${goal.title}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    {c.kind === "task" ? <CheckSquare className="size-3.5 shrink-0 text-violet" /> : <Repeat className="size-3.5 shrink-0 text-mint" />}
                    <span className="truncate">{c.label}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1 pl-5 text-[10.5px] text-muted-foreground">
                    <CornerLeftUp className="size-3 shrink-0" style={{ color: AREA_META[goal.area].color }} />
                    <span className="truncate">{goal.title}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {layout.hiddenActions > 0 && <p className="mt-2 text-right text-xs text-muted-foreground">+{layout.hiddenActions} more actions for today</p>}
    </section>
  )
}
