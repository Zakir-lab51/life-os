"use client"

import { Archive, ArchiveRestore, Check, CornerLeftUp, Ellipsis, Pencil, Plus, RotateCcw, Trash2, Trophy } from "lucide-react"
import { useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ChartFrame, ChartTooltip, LegendItem, axisProps } from "@/components/os/chart"
import { DatePicker } from "@/components/os/date-picker"
import { HatchBar, RingGauge } from "@/components/os/visuals"
import { deleteGoal, deleteGoalLog, logGoalValue, restoreGoal, setGoalStatus, toggleHabitLog, toggleMilestone, updateGoal } from "@/lib/db/repo"
import { addDays, formatDay, fromISODate, toISODate } from "@/lib/domain/dates"
import { HORIZON_META, linkedTasks, type GoalEvaluation } from "@/lib/domain/goals"
import type { Goal, Habit } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn, uid } from "@/lib/utils"
import { toggleDone } from "@/features/tasks/task-actions"
import { useLife, type Life } from "@/features/shell/use-life"
import { AreaDot, HorizonChip, OutlookBadge, dueText, forecastSentence, useGoalEvaluations } from "./shared"

/** The goal sheet: opened from anywhere with `useUI.showGoal(id)`. */
export function GoalDetailDialog() {
  const goalId = useUI((s) => s.openGoalId)
  const showGoal = useUI((s) => s.showGoal)
  const life = useLife()
  const evaluations = useGoalEvaluations(life)
  const goal = goalId && life ? life.data.goals.find((g) => g.id === goalId) : undefined
  const evaluation = goal ? evaluations.get(goal.id) : undefined

  return (
    <Dialog open={!!goalId} onOpenChange={(o) => !o && showGoal(null)}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-dialog p-0 sm:max-w-3xl">
        {goalId && life && (goal && evaluation ? (
          <GoalSheet key={goal.id} goal={goal} evaluation={evaluation} life={life} />
        ) : (
          <div className="p-8 text-center">
            <DialogTitle>Goal not found</DialogTitle>
            <DialogDescription className="mt-2">It may have been deleted.</DialogDescription>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}

function GoalSheet({ goal, evaluation, life }: { goal: Goal; evaluation: GoalEvaluation; life: Life }) {
  const { progress, forecast } = evaluation
  const { showGoal, openGoalEditor, openTaskEditor } = useUI.getState()
  const today = life.today
  const pct = Math.round(progress.ratio * 100)
  const parent = goal.parentId ? life.data.goals.find((g) => g.id === goal.parentId) : undefined
  const children = life.data.goals.filter((g) => g.parentId === goal.id && g.status !== "archived")
  const tasks = linkedTasks(goal, life.data.tasks).sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
  const habits = goal.habitIds.map((id) => life.data.habits.find((h) => h.id === id)).filter((h): h is Habit => !!h)
  const measureHabit = goal.measure.kind === "habit" ? life.data.habits.find((h) => h.id === (goal.measure as { habitId: string }).habitId) : undefined

  const remove = async () => {
    const snapshot = await attempt(() => deleteGoal(goal.id))
    if (!snapshot) return
    showGoal(null)
    toast("Goal deleted", { description: goal.title, action: { label: "Undo", onClick: () => void succeeded(() => restoreGoal(snapshot)) } })
  }
  const setStatus = async (status: Goal["status"]) => {
    if (!(await succeeded(() => setGoalStatus(goal.id, status)))) return
    if (status === "done") toast.success("Goal achieved", { description: goal.title, icon: <Trophy className="size-4" /> })
  }

  return (
    <div className="flex flex-col">
      {/* header */}
      <div className="border-b border-line px-6 pt-6 pb-5">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <HorizonChip horizon={goal.horizon} />
          <AreaDot goal={goal} />
          <OutlookBadge forecast={forecast} />
        </div>
        <DialogTitle className="mt-3 text-2xl leading-tight font-semibold tracking-tight">{goal.title}</DialogTitle>
        <DialogDescription className={cn("mt-1.5 text-sm", !goal.why && "sr-only")}>{goal.why || `${HORIZON_META[goal.horizon].adjective} goal`}</DialogDescription>
        {parent && (
          <button type="button" onClick={() => showGoal(parent.id)} className="pressable mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pr-3 pl-2 text-xs text-muted-foreground ring-1 ring-line hover:text-foreground">
            <CornerLeftUp className="size-3.5 shrink-0" />
            <span className="truncate">
              Serves <span className="font-medium text-foreground">{parent.title}</span>
            </span>
          </button>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {goal.status === "active" && (
            <Button size="sm" variant={progress.ratio >= 1 ? "default" : "outline"} onClick={() => void setStatus("done")}>
              <Trophy /> Mark achieved
            </Button>
          )}
          {goal.status !== "active" && (
            <Button size="sm" variant="outline" onClick={() => void setStatus("active")}>
              <RotateCcw /> {goal.status === "done" ? "Reopen" : "Restore"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openGoalEditor(goal.id)}>
            <Pencil /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {goal.status !== "archived" ? (
                <DropdownMenuItem onSelect={() => void setStatus("archived")}>
                  <Archive /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => void setStatus("active")}>
                  <ArchiveRestore /> Unarchive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-7 px-6 py-6">
        {/* progress */}
        <section className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <RingGauge value={pct} size={128} stroke={11} tone={goal.status === "done" ? "mint" : "violet"} label={`${pct}% · ${progress.label}`}>
            <div>
              <div className="text-3xl leading-none font-semibold tracking-tight tabular">{pct}%</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{progress.label}</div>
            </div>
          </RingGauge>
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="text-muted-foreground">
              Started {formatDay(goal.startDate, "d MMM yyyy")}
              {goal.dueDate && ` · deadline ${formatDay(goal.dueDate, "d MMM yyyy")}`} · <span className="font-medium text-foreground">{dueText(goal, today)}</span>
            </p>
            <p>{forecastSentence(goal, forecast, progress.ratio)}</p>
          </div>
        </section>

        <ProgressChart goal={goal} evaluation={evaluation} today={today} />

        {goal.measure.kind === "target" && goal.status === "active" && <LogProgress goal={goal} life={life} />}

        {goal.measure.kind === "habit" && (
          <section>
            <SectionTitle>Measured by a habit</SectionTitle>
            {measureHabit ? (
              <HabitRow habit={measureHabit} life={life} />
            ) : (
              <p className="rounded-2xl bg-surface-2/60 p-3 text-sm text-muted-foreground ring-1 ring-line">The habit this goal counted was deleted. Edit the goal to measure it another way.</p>
            )}
          </section>
        )}

        <Milestones goal={goal} today={today} />

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionTitle className="mb-0">{`Tasks${tasks.length ? ` · ${tasks.filter((t) => t.status === "done").length}/${tasks.length}` : ""}`}</SectionTitle>
            <Button size="xs" variant="ghost" onClick={() => openTaskEditor(null, { goalId: goal.id, area: goal.area })}>
              <Plus /> Add task
            </Button>
          </div>
          {tasks.length ? (
            <ul className="overflow-hidden rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 ring-1 ring-line">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <Checkbox checked={t.status === "done"} onCheckedChange={() => void toggleDone(t)} aria-label={`Done: ${t.title}`} />
                  <button type="button" onClick={() => openTaskEditor(t.id)} className={cn("strike min-w-0 flex-1 truncate text-left text-sm", t.status === "done" && "is-done")}>
                    {t.title}
                  </button>
                  {t.dueDate && <span className={cn("shrink-0 text-xs", t.status !== "done" && t.dueDate < today ? "text-rose" : "text-muted-foreground")}>{formatDay(t.dueDate, "d MMM")}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks linked yet. Link one from any task&apos;s editor, or add one here.</p>
          )}
        </section>

        {habits.length > 0 && (
          <section>
            <SectionTitle>Supporting habits</SectionTitle>
            <div className="space-y-2">
              {habits.map((h) => (
                <HabitRow key={h.id} habit={h} life={life} />
              ))}
            </div>
          </section>
        )}

        {children.length > 0 && (
          <section>
            <SectionTitle>Smaller goals that serve it</SectionTitle>
            <SmallerGoals goals={children} />
          </section>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children, className }: { children: string; className?: string }) {
  return <h3 className={cn("mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase", className)}>{children}</h3>
}

function ProgressChart({ goal, evaluation, today }: { goal: Goal; evaluation: GoalEvaluation; today: string }) {
  const { history, forecast, progress } = evaluation
  const t = (iso: string) => fromISODate(iso).getTime()
  const rows = new Map<number, { t: number; actual?: number; expected?: number; forecast?: number }>()
  const put = (iso: string, key: "actual" | "expected" | "forecast", v: number) => {
    const k = t(iso)
    rows.set(k, { ...(rows.get(k) ?? { t: k }), [key]: Math.round(v * 100) })
  }
  for (const p of history) put(p.date, "actual", p.ratio)
  if (goal.dueDate) {
    put(goal.startDate, "expected", 0)
    put(goal.dueDate, "expected", 1)
  }
  if (forecast.predicted && goal.status === "active") {
    put(today, "forecast", progress.ratio)
    put(forecast.predicted, "forecast", 1)
  }
  const data = [...rows.values()].sort((a, b) => a.t - b.t)
  const label = (ms: number) => formatDay(toISODate(new Date(ms)), "d MMM yy")

  return (
    <ChartFrame
      bare
      title="Progress over time"
      subtitle={goal.dueDate ? "Dashed: an even pace to the deadline" : "From the start date to today"}
      table={{ columns: ["Date", "Progress"], rows: history.map((p) => [formatDay(p.date, "d MMM yyyy"), `${Math.round(p.ratio * 100)}%`]) }}
      legend={
        <>
          <LegendItem color="var(--violet)" label="Progress" />
          {goal.dueDate && <LegendItem color="var(--muted-foreground)" label="Even pace" kind="line" />}
          {forecast.predicted && goal.status === "active" && <LegendItem color="var(--mint)" label="At recent pace" kind="line" />}
        </>
      }
    >
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={label} {...axisProps} minTickGap={36} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} width={44} />
            <Tooltip content={<ChartTooltip format={(v) => `${v}%`} labelFormat={(l) => label(Number(l))} />} />
            <Area dataKey="actual" name="Progress" type="stepAfter" stroke="var(--violet)" strokeWidth={2} fill="var(--violet)" fillOpacity={0.14} connectNulls isAnimationActive={false} dot={history.length === 1 ? { r: 3.5, fill: "var(--violet)", strokeWidth: 0 } : false} />
            <Line dataKey="expected" name="Even pace" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.25} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="forecast" name="At recent pace" stroke="var(--mint)" strokeDasharray="2 3" strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  )
}

function LogProgress({ goal, life }: { goal: Goal; life: Life }) {
  const m = goal.measure as Extract<Goal["measure"], { kind: "target" }>
  const logs = life.data.goalLogs.filter((l) => l.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date))
  const [value, setValue] = useState(String(logs[0]?.value ?? m.start))
  const [date, setDate] = useState(life.today)
  const [note, setNote] = useState("")
  const save = async () => {
    const n = Number(value)
    if (value.trim() === "" || !Number.isFinite(n)) return toast.error("Enter a number")
    if (await succeeded(() => logGoalValue(goal.id, { date, value: n, note }))) {
      setNote("")
      toast.success("Progress logged", { description: `${n}${m.unit ? ` ${m.unit}` : ""} on ${formatDay(date, "d MMM")}` })
    }
  }
  return (
    <section>
      <SectionTitle>Log progress</SectionTitle>
      <form
        className="grid gap-2 rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 p-3 ring-1 ring-line sm:grid-cols-[8rem_10rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="relative">
          <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Where you are now${m.unit ? ` (${m.unit})` : ""}`} className="h-9 rounded-xl pr-12" />
          {m.unit && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{m.unit}</span>}
        </div>
        <DatePicker value={date} allowClear={false} onChange={(v) => v && setDate(v)} />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={500} aria-label="Note" className="h-9 rounded-xl" />
        <Button type="submit" size="sm" className="h-9">
          <Check /> Log
        </Button>
      </form>
      <p className="mt-1.5 px-1 text-xs text-muted-foreground">
        Enter the total you&apos;ve reached (from {m.start} towards {m.target}
        {m.unit ? ` ${m.unit}` : ""}), not the amount added today.
      </p>
      {logs.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {logs.slice(0, 6).map((l) => (
            <li key={l.id} className="group/log flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-foreground/[0.03]">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDay(l.date, "d MMM")}</span>
              <span className="font-medium tabular">
                {l.value}
                {m.unit ? ` ${m.unit}` : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.note}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`Delete the entry for ${formatDay(l.date, "d MMM")}`} className="opacity-0 group-hover/log:opacity-100 focus-visible:opacity-100" onClick={() => void attempt(() => deleteGoalLog(l.id))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Milestones({ goal, today }: { goal: Goal; today: string }) {
  const [title, setTitle] = useState("")
  const [due, setDue] = useState<string | null>(null)
  if (!goal.milestones.length && goal.status !== "active") return null
  const add = async () => {
    const t = title.trim()
    if (!t) return
    if (await succeeded(() => updateGoal(goal.id, { milestones: [...goal.milestones, { id: uid("ms_"), title: t.slice(0, 120), due, doneAt: null }] }))) {
      setTitle("")
      setDue(null)
    }
  }
  const done = goal.milestones.filter((m) => m.doneAt).length
  return (
    <section>
      <SectionTitle>{`Milestones${goal.milestones.length ? ` · ${done}/${goal.milestones.length}` : ""}`}</SectionTitle>
      <ol className="relative space-y-1">
        {goal.milestones.map((m, i) => {
          const late = !m.doneAt && m.due && m.due < today
          return (
            <li key={m.id} className="relative flex items-center gap-3 rounded-xl px-1 py-1.5">
              {i < goal.milestones.length - 1 && <span aria-hidden className={cn("absolute top-8 bottom-[-10px] left-[15px] w-0.5 rounded-full", m.doneAt ? "bg-mint/60" : "bg-line")} />}
              <button
                type="button"
                role="checkbox"
                aria-checked={!!m.doneAt}
                aria-label={`${m.doneAt ? "Reached" : "Reach"}: ${m.title}`}
                onClick={() =>
                  void attempt(async () => {
                    if (await toggleMilestone(goal.id, m.id)) toast.success("Milestone reached", { description: m.title })
                  })
                }
                className={cn("pressable relative grid size-7 shrink-0 place-items-center rounded-full ring-1 transition-colors", m.doneAt ? "bg-mint text-white ring-mint" : "bg-surface-2 text-muted-foreground ring-line hover:ring-foreground/30")}
              >
                {m.doneAt ? <Check className="size-4" strokeWidth={3} /> : <span className="text-[11px] font-semibold">{i + 1}</span>}
              </button>
              <span className={cn("min-w-0 flex-1 truncate text-sm", m.doneAt && "text-muted-foreground")}>{m.title}</span>
              <span className={cn("shrink-0 text-xs", late ? "text-rose" : "text-muted-foreground")}>
                {m.doneAt ? `Reached ${formatDay(toISODate(new Date(m.doneAt)), "d MMM")}` : m.due ? `${late ? "Was due" : "Due"} ${formatDay(m.due, "d MMM")}` : ""}
              </span>
            </li>
          )
        })}
      </ol>
      {goal.status === "active" && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" maxLength={120} className="h-9 flex-1 rounded-xl" />
          <div className="w-36 shrink-0">
            <DatePicker value={due} placeholder="No date" onChange={setDue} />
          </div>
          <Button type="submit" size="icon-sm" variant="secondary" aria-label="Add milestone" disabled={!title.trim()}>
            <Plus />
          </Button>
        </form>
      )}
    </section>
  )
}

function HabitRow({ habit, life }: { habit: Habit; life: Life }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(life.today, i - 6))
  const done = new Set(life.data.habitLogs.filter((l) => l.habitId === habit.id).map((l) => l.date))
  const checkedToday = done.has(life.today)
  return (
    <div className="flex items-center gap-3 rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 px-4 py-2.5 ring-1 ring-line">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{habit.name}</span>
      <span className="hidden items-center gap-1 sm:flex" aria-label={`Last 7 days: ${days.filter((d) => done.has(d)).length} check-ins`}>
        {days.map((d) => (
          <span key={d} className={cn("size-2 rounded-full", done.has(d) ? "bg-mint" : "bg-surface-3")} />
        ))}
      </span>
      <Button size="xs" variant={checkedToday ? "secondary" : "outline"} onClick={() => void attempt(() => toggleHabitLog(habit.id, life.today))} aria-pressed={checkedToday}>
        {checkedToday ? <Check /> : null}
        {checkedToday ? "Done today" : "Check in"}
      </Button>
    </div>
  )
}

function SmallerGoals({ goals }: { goals: Goal[] }) {
  const life = useLife()
  const evaluations = useGoalEvaluations(life)
  const showGoal = useUI((s) => s.showGoal)
  return (
    <ul className="space-y-2">
      {goals.map((g) => {
        const e = evaluations.get(g.id)
        return (
          <li key={g.id}>
            <button type="button" onClick={() => showGoal(g.id)} className="pressable w-full rounded-[calc(var(--radius)*1.15)] bg-surface-2/60 px-4 py-3 text-left ring-1 ring-line [--press-scale:0.99] hover:bg-surface-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{g.title}</span>
                <HorizonChip horizon={g.horizon} />
              </div>
              <HatchBar value={e?.progress.ratio ?? 0} tone="violet" height={6} />
              {e && <p className="mt-1 text-[11px] text-muted-foreground">{e.progress.label} · {dueText(g, life!.today)}</p>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
