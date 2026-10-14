"use client"

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { Segmented } from "@/components/os/field"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel } from "@/components/os/panel"
import { Button } from "@/components/ui/button"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { addDays, formatClock, formatDay } from "@/lib/domain/dates"
import { KIND_TONE, assignLanes } from "@/lib/domain/planner"
import type { Block, ISODate, Task } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"

export type CalendarMode = "month" | "week"

export function ModeToggle({ mode, onChange }: { mode: CalendarMode; onChange: (m: CalendarMode) => void }) {
  return (
    <Segmented<CalendarMode>
      ariaLabel="Calendar view"
      value={mode}
      onChange={onChange}
      options={[
        { value: "month", label: "Month" },
        { value: "week", label: "Week" },
      ]}
    />
  )
}

const HOUR = 44 // px per hour in the week grid

/**
 * The week, hour by hour: seven columns of time blocks on iPad and desktop, with each day's
 * open tasks above it; on a phone, where seven columns don't fit, a day-by-day list. A block
 * opens its editor; a day's heading opens it in My Day.
 */
export function WeekView({ life, start, blocks, onWeek, mode, onMode }: { life: Life; start: ISODate; blocks: Block[]; onWeek: (start: ISODate | null) => void; mode: CalendarMode; onMode: (m: CalendarMode) => void }) {
  const { data, today, prefs } = life
  const router = useRouter()
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])
  const end = days[6]

  const byDay = useMemo(() => {
    const m = new Map<ISODate, Block[]>()
    for (const b of blocks) if (b.date >= start && b.date <= end) m.set(b.date, [...(m.get(b.date) ?? []), b])
    for (const list of m.values()) list.sort((a, b) => a.start - b.start)
    return m
  }, [blocks, start, end])
  const tasksByDay = useMemo(() => {
    const m = new Map<ISODate, Task[]>()
    for (const t of data.tasks) if (t.dueDate && t.status !== "done" && t.dueDate >= start && t.dueDate <= end) m.set(t.dueDate, [...(m.get(t.dueDate) ?? []), t])
    return m
  }, [data.tasks, start, end])

  // the grid spans your day, widened to any block outside it
  const firstHour = Math.floor(Math.min(prefs.dayStartMin, ...blocks.map((b) => b.start)) / 60)
  const lastHour = Math.ceil(Math.max(prefs.dayEndMin, ...blocks.map((b) => b.end)) / 60)
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const openDay = (d: ISODate) => {
    setPlannerDate(d === today ? null : d)
    router.push("/today")
  }
  const isThisWeek = today >= start && today <= end

  return (
    <PageTransition>
      <PageHeader
        title="Calendar"
        description="Your week, hour by hour. Pick a day to plan it in My Day."
        actions={
          <>
            <ModeToggle mode={mode} onChange={onMode} />
            <Button onClick={() => openBlockEditor({ date: isThisWeek ? today : start })}>
              <CalendarPlus /> Add a block
            </Button>
          </>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            {formatDay(start, "d MMM")} – {formatDay(end, "d MMM yyyy")}
          </h2>
          <div className="flex items-center rounded-control border border-line bg-surface p-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => onWeek(addDays(start, -7))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" disabled={isThisWeek} onClick={() => onWeek(null)}>
              This week
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => onWeek(addDays(start, 7))}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* iPad and desktop: seven columns on an hour grid */}
        <div className="hidden @3xl/main:block">
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-1.5">
            <div />
            {days.map((d) => (
              <button key={d} type="button" onClick={() => openDay(d)} className={cn("rounded-xl px-1 py-1.5 text-center outline-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring", d === today && "bg-violet/15")}>
                <span className="block text-[11px] font-medium text-muted-foreground">{formatDay(d, "EEE")}</span>
                <span className={cn("block text-lg font-semibold tabular", d === today && "text-violet")}>{formatDay(d, "d")}</span>
              </button>
            ))}
            {/* each day's open tasks */}
            <div className="pt-1.5 text-right text-[10px] leading-tight text-muted-foreground">Due</div>
            {days.map((d) => {
              const tasks = tasksByDay.get(d) ?? []
              return (
                <div key={d} className="min-h-7 space-y-1 pt-1.5">
                  {tasks.slice(0, 3).map((t) => (
                    <button key={t.id} type="button" onClick={() => openTaskEditor(t.id)} className="block w-full truncate rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-left text-[11px] outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring">
                      {t.title}
                    </button>
                  ))}
                  {tasks.length > 3 && <p className="px-1.5 text-[10px] text-muted-foreground">+{tasks.length - 3} more</p>}
                </div>
              )
            })}
          </div>
          <div className="mt-2 grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-1.5" style={{ height: hours.length * HOUR }}>
            <div className="relative">
              {hours.map((h, i) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular" style={{ top: i * HOUR }}>
                  {i === 0 ? "" : formatClock(h * 60).replace(":00", "")}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const list = byDay.get(d) ?? []
              const lanes = assignLanes(list)
              return (
                <div key={d} className={cn("relative rounded-xl border border-line/60", d === today && "bg-violet/[0.05]")}>
                  {hours.slice(1).map((h, i) => (
                    <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/60" style={{ top: (i + 1) * HOUR }} />
                  ))}
                  {list.map((b) => {
                    const lane = lanes.get(b.id) ?? { lane: 0, of: 1 }
                    const tone = ACCENT_CLASSES[KIND_TONE[b.kind]]
                    const top = ((b.start - firstHour * 60) / 60) * HOUR
                    const height = Math.max(16, ((b.end - b.start) / 60) * HOUR - 2)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openBlockEditor({ blockId: b.id })}
                        aria-label={`${b.title}, ${formatDay(d, "EEEE")} ${formatClock(b.start)} to ${formatClock(b.end)}`}
                        className={cn("absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 text-left text-[11px] leading-tight outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring", tone.soft, height < 30 ? "py-0" : "py-1")}
                        style={{ top: top + 1, height, left: `calc(${(lane.lane / lane.of) * 100}% + 2px)`, width: `calc(${100 / lane.of}% - 4px)`, borderLeftColor: tone.fill }}
                      >
                        <span className="block truncate font-semibold">{b.title}</span>
                        {height >= 30 && <span className="block truncate text-muted-foreground tabular">{formatClock(b.start)}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* phone: day by day */}
        <ol className="space-y-3 @3xl/main:hidden">
          {days.map((d) => {
            const list = byDay.get(d) ?? []
            const tasks = tasksByDay.get(d) ?? []
            return (
              <li key={d} className={cn("rounded-2xl border border-line p-3", d === today && "border-violet/40 bg-violet/[0.06]")}>
                <button type="button" onClick={() => openDay(d)} className="flex w-full items-baseline gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn("font-semibold", d === today && "text-violet")}>{d === today ? "Today" : formatDay(d, "EEEE")}</span>
                  <span className="text-xs text-muted-foreground">{formatDay(d, "d MMM")}</span>
                  <ChevronRight className="ml-auto size-4 self-center text-muted-foreground" />
                </button>
                {list.length === 0 && tasks.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Nothing planned</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((b) => {
                      const tone = ACCENT_CLASSES[KIND_TONE[b.kind]]
                      return (
                        <li key={b.id}>
                          <button type="button" onClick={() => openBlockEditor({ blockId: b.id })} className={cn("flex w-full items-center gap-2 rounded-xl border-l-[3px] px-2.5 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", tone.soft)} style={{ borderLeftColor: tone.fill }}>
                            <span className="w-16 shrink-0 text-xs text-muted-foreground tabular">{formatClock(b.start)}</span>
                            <span className="min-w-0 truncate font-medium">{b.title}</span>
                          </button>
                        </li>
                      )
                    })}
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => openTaskEditor(t.id)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1 text-left text-sm outline-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">Due</span>
                          <span className="min-w-0 truncate">{t.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </Panel>
    </PageTransition>
  )
}
