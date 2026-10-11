"use client"

import { Archive, ArchiveRestore, Check, ChevronDown, Flame, Lock, MoreHorizontal, Pencil, Plus, Repeat, ShieldCheck, Trash2, Trophy } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Heatmap } from "@/components/os/heatmap"
import { Icon } from "@/components/os/icon"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { AreaBadge, EmptyState, HatchBar, RingGauge, StatTile } from "@/components/os/visuals"
import { useActivity, useUnlocks } from "@/lib/db/hooks"
import { setHabitArchived, toggleHabitLog } from "@/lib/db/repo"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { addDays, daysBetween, formatDay, startOfWeek } from "@/lib/domain/dates"
import { bestStreak, completionRate, currentStreak, describeSchedule, habitsForDay, isDueOn, logsByHabit, overallConsistency, weekCount } from "@/lib/domain/habits"
import type { Habit, ISODate } from "@/lib/domain/types"
import { ACHIEVEMENTS, XP_RULES } from "@/lib/domain/xp"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { evaluateProgress } from "@/features/shell/progress"
import { useLife, type Life } from "@/features/shell/use-life"
import { deleteHabitWithUndo } from "./habit-editor"

export function HabitsView() {
  const life = useLife()
  if (!life) {
    return (
      <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-panel" />
        ))}
      </div>
    )
  }
  return <Habits life={life} />
}

async function toggle(habit: Habit, date: ISODate, label?: string) {
  const now = await attempt(() => toggleHabitLog(habit.id, date))
  if (now === undefined) return
  if (now) toast.success(`${habit.name} · ${label ?? "checked in"}`, { description: `+${XP_RULES.habit} XP` })
}

function Habits({ life }: { life: Life }) {
  const { data, today, prefs } = life
  const openHabitEditor = useUI((s) => s.openHabitEditor)
  const [showArchived, setShowArchived] = useState(false)
  const byHabit = useMemo(() => logsByHabit(data.habitLogs), [data.habitLogs])
  const active = data.habits.filter((h) => !h.archivedAt)
  const archived = data.habits.filter((h) => h.archivedAt)
  const todayItems = habitsForDay(active, byHabit, today, prefs.weekStartsOn)

  const weekStart = startOfWeek(today, prefs.weekStartsOn)
  const thisWeek = overallConsistency(active, byHabit, weekStart, today)
  const lastWeek = overallConsistency(active, byHabit, addDays(weekStart, -7), addDays(weekStart, -1))
  const last30 = overallConsistency(active, byHabit, addDays(today, -29), today)

  const dayValue = (d: ISODate) => {
    const due = active.filter((h) => h.schedule.kind !== "weekly" && isDueOn(h, d))
    const weeklyHits = active.filter((h) => h.schedule.kind === "weekly" && byHabit.get(h.id)?.has(d)).length
    if (!due.length && !weeklyHits) return active.some((h) => daysBetween(h.startDate, d) >= 0) ? 0 : null
    const kept = due.filter((h) => byHabit.get(h.id)?.has(d)).length
    return Math.min(1, (kept + weeklyHits) / Math.max(1, due.length + weeklyHits))
  }

  return (
    <PageTransition>
      <PageHeader
        title="Habits"
        description="Small things, repeated. One missed day a week counts as rest, not failure."
        actions={
          <Button onClick={() => openHabitEditor(null)}>
            <Plus /> New habit
          </Button>
        }
      />

      {active.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Repeat}
            title="No habits yet"
            body="Start with one tiny habit you can do even on a bad day. You can add a time of day so Plan My Day makes room for it."
            action={
              <Button onClick={() => openHabitEditor(null)}>
                <Plus /> Create your first habit
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 @4xl/main:grid-cols-4">
            <StatTile label="Today" value={`${todayItems.filter((i) => i.done).length}/${todayItems.length}`} sub="check-ins done" icon={Check} tone="mint" />
            <StatTile
              label="This week"
              value={thisWeek === null ? "–" : `${Math.round(thisWeek * 100)}%`}
              sub={lastWeek === null || thisWeek === null ? "consistency" : `${thisWeek >= lastWeek ? "+" : ""}${Math.round((thisWeek - lastWeek) * 100)} pts vs last week`}
              icon={Repeat}
              tone="violet"
            />
            <StatTile label="Last 30 days" value={last30 === null ? "–" : `${Math.round(last30 * 100)}%`} sub="of due check-ins kept" icon={ShieldCheck} tone="cyan" />
            <StatTile
              label="Longest streak"
              value={Math.max(0, ...active.map((h) => bestStreak(h, byHabit.get(h.id) ?? new Set(), today, prefs.weekStartsOn)))}
              sub="best run across habits"
              icon={Flame}
              tone="amber"
            />
          </div>

          <Panel className="mb-4">
            <PanelHeader title="Check in" subtitle={formatDay(today, "EEEE, d MMMM")} />
            {todayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled today. Enjoy the rest.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {todayItems.map(({ habit, done, progress }) => (
                  <button
                    key={habit.id}
                    type="button"
                    aria-pressed={done}
                    onClick={() => void toggle(habit, today)}
                    className={cn("flex items-center gap-2.5 rounded-control border py-1.5 pr-4 pl-1.5 text-sm font-medium transition-all", done ? "border-transparent bg-surface-3" : "border-line hover:border-foreground/30")}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-full transition-colors", done ? cn(ACCENT_CLASSES[habit.color].bg, "text-primary-foreground") : cn(ACCENT_CLASSES[habit.color].soft, ACCENT_CLASSES[habit.color].text))}>
                      {done ? <Check className="size-4" strokeWidth={3} /> : <Icon name={habit.icon} className="size-4" />}
                    </span>
                    {habit.name}
                    {progress && (
                      <span className="text-xs text-muted-foreground tabular">
                        {progress.count}/{progress.target} wk
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-4 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
            {active.map((h) => (
              <HabitCard key={h.id} habit={h} done={byHabit.get(h.id) ?? new Set()} today={today} weekStartsOn={prefs.weekStartsOn} />
            ))}
          </div>

          <Panel className="mt-4">
            <PanelHeader title="Consistency" subtitle="All habits, last 26 weeks" />
            <Heatmap
              end={today}
              weeks={26}
              weekStartsOn={prefs.weekStartsOn}
              label="All-habit consistency"
              value={dayValue}
              describe={(d, v) => `${formatDay(d, "EEE d MMM")}: ${v === null ? "not tracked" : `${Math.round(v * 100)}% of habits kept`}`}
            />
          </Panel>
        </>
      )}

      <ProgressSection life={life} />

      <HabitHistory />

      {archived.length > 0 && (
        <Panel className="mt-4">
          <button type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived} className="flex items-center gap-2 text-left font-semibold">
            <Archive className="size-4 text-muted-foreground" /> Archived ({archived.length})
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showArchived && "rotate-180")} />
          </button>
          {showArchived && (
            <ul className="mt-3 space-y-1">
              {archived.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2/60">
                  <Icon name={h.icon} className="size-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">{h.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => void attempt(() => setHabitArchived(h.id, false))}>
                    <ArchiveRestore /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </PageTransition>
  )
}

function HabitCard({ habit, done, today, weekStartsOn }: { habit: Habit; done: Set<ISODate>; today: ISODate; weekStartsOn: 0 | 1 }) {
  const openHabitEditor = useUI((s) => s.openHabitEditor)
  const streak = currentStreak(habit, done, today, weekStartsOn)
  const best = bestStreak(habit, done, today, weekStartsOn)
  const rate = completionRate(habit, done, addDays(today, -29), today, weekStartsOn)
  const tone = ACCENT_CLASSES[habit.color]
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const unit = streak.unit === "week" ? "wk" : "d"

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", tone.soft, tone.text)}>
          <Icon name={habit.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{habit.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {describeSchedule(habit)}
            {habit.timeOfDay !== "anytime" && <span>· {habit.timeOfDay}</span>}
            <AreaBadge area={habit.area} />
            {habit.demo && <span className="rounded-control border border-dashed border-line px-1.5">demo</span>}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${habit.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openHabitEditor(habit.id)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                if (!(await succeeded(() => setHabitArchived(habit.id, true)))) return
                toast("Habit archived", { description: "History kept. Restore it from Archived." })
              }}
            >
              <Archive /> Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void deleteHabitWithUndo(habit)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="flex items-center justify-center gap-1 text-2xl font-semibold">
            <Flame className={cn("size-5", streak.current ? "text-amber" : "text-muted-foreground/40")} />
            {streak.current}
          </div>
          <div className="text-[11px] text-muted-foreground">streak ({unit})</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{best}</div>
          <div className="text-[11px] text-muted-foreground">best ({unit})</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{rate === null ? "–" : `${Math.round(rate * 100)}%`}</div>
          <div className="text-[11px] text-muted-foreground">30 days</div>
        </div>
      </div>
      {streak.restDaysUsed > 0 && (
        <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3 text-mint" /> {streak.restDaysUsed} rest day{streak.restDaysUsed > 1 ? "s" : ""} kept this streak going
        </p>
      )}

      <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Last 7 days">
        {week.map((d) => {
          const due = isDueOn(habit, d)
          const checked = done.has(d)
          const beforeStart = daysBetween(habit.startDate, d) < 0
          return (
            <button
              key={d}
              type="button"
              disabled={beforeStart}
              aria-pressed={checked}
              aria-label={`${formatDay(d, "EEEE d MMM")}: ${checked ? "done" : due ? "not done" : "not scheduled"}`}
              onClick={() => void toggle(habit, d, d === today ? "checked in" : `logged for ${formatDay(d, "EEE")}`)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] transition-colors disabled:opacity-30",
                d === today && "ring-1 ring-line",
                checked ? cn(tone.bg, "text-primary-foreground") : due ? "bg-surface-2 text-muted-foreground hover:bg-surface-3" : "text-muted-foreground/50 hover:bg-surface-2",
              )}
            >
              {formatDay(d, "EEEEE")}
              <span className={cn("grid size-4 place-items-center rounded-full", !checked && due && "border border-current")}>{checked && <Check className="size-3" strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      {habit.schedule.kind === "weekly" && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>This week</span>
            <span className="tabular">
              {weekCount(done, today, weekStartsOn)}/{habit.schedule.times}
            </span>
          </div>
          <HatchBar value={weekCount(done, today, weekStartsOn) / habit.schedule.times} tone={habit.color} height={6} />
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <Heatmap
          end={today}
          weeks={17}
          cell={10}
          weekStartsOn={weekStartsOn}
          label={`${habit.name} history`}
          value={(d) => (daysBetween(habit.startDate, d) < 0 ? null : done.has(d) ? 1 : isDueOn(habit, d) && habit.schedule.kind !== "weekly" ? 0 : habit.schedule.kind === "weekly" ? 0 : null)}
          describe={(d, v) => `${formatDay(d, "EEE d MMM")}: ${v === null ? "not scheduled" : v > 0 ? "done" : "not done"}`}
        />
      </div>
    </Panel>
  )
}

function ProgressSection({ life }: { life: Life }) {
  const unlocks = useUnlocks()
  const { stats, xp, level } = useMemo(() => evaluateProgress(life.data, life.today), [life])
  const unlockedAt = new Map(unlocks?.map((u) => [u.id, u.unlockedAt]))
  return (
    <section id="progress" className="mt-4 grid scroll-mt-24 gap-4 @4xl/main:grid-cols-[340px_1fr]">
      <Panel>
        <PanelHeader title={`Level ${level.level}`} subtitle={level.title} icon={Trophy} tone="amber" />
        <div className="flex items-center gap-5">
          <RingGauge value={level.progress * 100} size={110} stroke={10} tone="amber" label={`${level.intoLevel} of ${level.needed} XP`}>
            <div>
              <div className="text-xl font-semibold">{level.intoLevel}</div>
              <div className="text-[10px] text-muted-foreground">of {level.needed} XP</div>
            </div>
          </RingGauge>
          <div className="text-sm">
            <div className="text-3xl font-semibold">{xp.total}</div>
            <div className="text-xs text-muted-foreground">total XP</div>
          </div>
        </div>
        <dl className="mt-5 space-y-1.5 text-sm">
          {(
            [
              ["Tasks finished", xp.tasks],
              ["Habit check-ins", xp.habits],
              ["Focus time", xp.focus],
              ["Reflections", xp.reflections],
              ["Goals & milestones", xp.goals],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular">{v} XP</dd>
            </div>
          ))}
        </dl>
        <details className="mt-5 rounded-2xl border border-line p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">How XP works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Task: {XP_RULES.task} XP (+{XP_RULES.importantTaskBonus} for urgent or high priority)
            </li>
            <li>Habit check-in: {XP_RULES.habit} XP</li>
            <li>
              Focus: {XP_RULES.focusPer5Min} XP per 5 minutes, capped at {XP_RULES.focusDailyCapMin / 60} hours a day, so overworking earns nothing extra
            </li>
            <li>Daily reflection: {XP_RULES.reflection} XP</li>
            <li>Nothing is ever taken away for missed days. Undoing an action removes exactly the XP it gave.</li>
          </ul>
        </details>
      </Panel>
      <Panel>
        <PanelHeader title="Achievements" subtitle={`${ACHIEVEMENTS.filter((a) => a.check(stats)).length} of ${ACHIEVEMENTS.length} unlocked`} />
        <ul className="grid gap-2 @xl:grid-cols-2 @3xl:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const earned = a.check(stats)
            const [cur, goal] = a.progress(stats)
            const at = unlockedAt.get(a.id)
            return (
              <li key={a.id} className={cn("flex items-start gap-3 rounded-2xl border p-3", earned ? "border-amber/30 bg-amber/[0.06]" : "border-line")}>
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", earned ? "bg-amber text-primary-foreground" : "bg-surface-2 text-muted-foreground")}>
                  {earned ? <Icon name={a.icon} className="size-5" /> : <Lock className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {earned ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{at ? `Unlocked ${new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Unlocked"}</p>
                  ) : (
                    <div className="mt-1.5">
                      <HatchBar value={cur / goal} tone="amber" height={5} />
                      <p className="mt-0.5 text-[10px] text-muted-foreground tabular">
                        {cur}/{goal}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Panel>
    </section>
  )
}

function HabitHistory() {
  const activity = useActivity(200)
  const items = (activity ?? []).filter((a) => a.type === "habit.checked").slice(0, 12)
  if (!items.length) return null
  return (
    <Panel className="mt-4">
      <PanelHeader title="Recent check-ins" subtitle="Your habit history" />
      <ul className="divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Check className="size-3.5 text-mint" />
              {a.title}
            </span>
            <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
