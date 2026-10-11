"use client"

import { CloudRain, Maximize2, Minimize2, Pause, Play, RotateCcw, Save, SkipForward, Square, Trash2, Volume2, VolumeX, Waves, Wind } from "lucide-react"
import Link from "next/link"
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { ChartFrame, ChartTooltip, axisProps } from "@/components/os/chart"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState, StatTile } from "@/components/os/visuals"
import { ambient } from "@/lib/audio/ambient"
import { useNow } from "@/lib/db/hooks"
import { deleteFocusSession, recordFocusSession } from "@/lib/db/repo"
import { AREA_META } from "@/lib/domain/areas"
import { addDays, formatDay, formatDuration } from "@/lib/domain/dates"
import { IDLE_TIMER, MIN_RECORDED_SEC, elapsedMs, formatTimer, nextPhase, remainingMs, type FocusPhase } from "@/lib/domain/focus"
import { AREAS, type Area, type FocusMode, type FocusSession } from "@/lib/domain/types"
import { focusStreak } from "@/lib/domain/xp"
import { attempt, succeeded } from "@/lib/feedback"
import { useFocus, type AmbientKind } from "@/lib/stores/focus"
import { cn } from "@/lib/utils"
import { finalizeFocus } from "@/features/shell/engines"
import { useLife, type Life } from "@/features/shell/use-life"
import { FocusOrb } from "./focus-orb"

const PHASE_LABEL: Record<FocusPhase, string> = { focus: "Focus", short: "Short break", long: "Long break" }

export function FocusView() {
  const life = useLife()
  if (!life) {
    return (
      <div className="grid gap-4 @5xl/main:grid-cols-[1fr_360px]" aria-busy="true">
        <Skeleton className="h-[620px] rounded-panel" />
        <Skeleton className="h-[620px] rounded-panel" />
      </div>
    )
  }
  return <Focus life={life} />
}

function Focus({ life }: { life: Life }) {
  const { prefs, data, today } = life
  const store = useFocus()
  const { timer, customMin, area, ambient: ambientKind, volume } = store
  const now = useNow(250)
  const stage = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const mode = timer.mode
  const running = timer.status === "running"
  const idle = timer.status === "idle"
  const elapsed = elapsedMs(timer, now)
  const remaining = remainingMs(timer, now)
  const phaseMinutes = (phase: FocusPhase) => (phase === "focus" ? prefs.focus.focusMin : phase === "short" ? prefs.focus.shortBreakMin : prefs.focus.longBreakMin)
  const plannedIdleMs = mode === "stopwatch" ? null : (mode === "custom" ? customMin : phaseMinutes(timer.phase)) * 60_000
  const display = idle ? (plannedIdleMs === null ? 0 : plannedIdleMs) : (remaining ?? elapsed)
  const progress = idle ? (plannedIdleMs === null ? null : 0) : timer.plannedMs === null ? null : elapsed / timer.plannedMs

  const openTasks = data.tasks.filter((t) => t.status !== "done").sort((a, b) => a.priority - b.priority)
  const linkedTask = timer.taskId ? data.tasks.find((t) => t.id === timer.taskId) : undefined

  const start = () => {
    const minutes = mode === "stopwatch" ? null : mode === "custom" ? customMin : phaseMinutes(timer.phase)
    store.begin({ mode, phase: mode === "pomodoro" ? timer.phase : "focus", minutes, taskId: timer.taskId })
  }
  const toggleRun = () => {
    if (idle) start()
    else if (running) store.pauseTimer()
    else store.resumeTimer()
  }

  const stopAndSave = async () => {
    const stamp = Date.now()
    const snapshot = useFocus.getState().timer
    if (snapshot.phase !== "focus") {
      store.setTimer({ ...IDLE_TIMER, mode: snapshot.mode, phase: "focus", cycle: snapshot.cycle, taskId: snapshot.taskId })
      return
    }
    const completed = snapshot.mode === "stopwatch"
    const saved = await attempt(() => finalizeFocus(snapshot, stamp, completed, area))
    store.setTimer({ ...IDLE_TIMER, mode: snapshot.mode, phase: "focus", cycle: snapshot.cycle, taskId: snapshot.taskId })
    if (saved) toast.success(`Saved ${formatDuration(Math.round(elapsedMs(snapshot, stamp) / 60_000))} of focus`)
    else toast(`Under ${MIN_RECORDED_SEC / 60} minute, so nothing was saved`)
  }

  const skipBreak = () => {
    const np = nextPhase(timer.phase, timer.cycle, prefs.focus.longEvery)
    store.setTimer({ ...IDLE_TIMER, mode: "pomodoro", phase: np.phase, cycle: np.cycle, taskId: timer.taskId })
  }

  const discard = () => {
    store.reset()
    setConfirmDiscard(false)
    toast("Session discarded")
  }

  const setMode = (m: FocusMode) => {
    if (!idle) return
    store.setTimer({ ...IDLE_TIMER, mode: m, phase: "focus", cycle: 0, taskId: timer.taskId })
  }

  // fullscreen + keyboard
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen().catch(() => setFullscreen((f) => !f))
    else setFullscreen((f) => !f)
  }
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const el = e.target as HTMLElement
    if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName) || el.closest("[role=dialog],[role=menu],[role=listbox],[role=slider]")) return
    if (e.key === " ") {
      e.preventDefault()
      toggleRun()
    }
    if (e.key === "f") void toggleFullscreen()
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const playAmbient = (kind: AmbientKind) => {
    store.setAmbient(kind)
    void ambient?.play(kind, volume)
  }

  const phaseTone = timer.phase === "focus" ? "focus" : "break"
  const zen = fullscreen

  return (
    <PageTransition>
      {!zen && (
        <PageHeader
          title="Focus"
          description="Timers keep exact time even in a background tab. Finished sessions are saved automatically."
          actions={
            <Button variant="outline" onClick={() => void toggleFullscreen()}>
              <Maximize2 /> Distraction-free
            </Button>
          }
        />
      )}
      <div className={cn("grid items-start gap-4", !zen && "@5xl/main:grid-cols-[minmax(0,1fr)_380px]")}>
        <div ref={stage} className={cn("glass relative flex flex-col items-center rounded-panel px-4 py-8 sm:px-8", zen && "fixed inset-0 z-[70] justify-center rounded-none border-0 bg-background")}>
          {zen && (
            <Button variant="ghost" size="sm" className="absolute top-5 right-5" onClick={() => void toggleFullscreen()}>
              <Minimize2 /> Exit
            </Button>
          )}
          {!zen && (
            <div className="mb-6 flex rounded-control border border-line bg-surface-2/60 p-1" role="radiogroup" aria-label="Timer mode">
              {(["pomodoro", "custom", "stopwatch"] as FocusMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={!idle && mode !== m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-control px-4 py-1.5 text-sm capitalize transition-colors disabled:opacity-40", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "pomodoro" ? "Pomodoro" : m}
                </button>
              ))}
            </div>
          )}

          <FocusOrb progress={progress} running={running} tone={phaseTone} size={zen ? 380 : 320}>
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">{mode === "stopwatch" ? "Stopwatch" : PHASE_LABEL[timer.phase]}</p>
            <p className="mt-2 text-[4rem] leading-none font-semibold tracking-tight tabular sm:text-[4.5rem]" aria-live="off">
              {formatTimer(display)}
            </p>
            <p className="mt-2 h-5 text-sm text-muted-foreground">
              {timer.status === "paused" ? "Paused" : linkedTask ? linkedTask.title.slice(0, 34) : idle ? "Ready" : "In session"}
            </p>
            {mode === "pomodoro" && (
              <div className="mt-3 flex justify-center gap-1.5" aria-label={`${timer.cycle % prefs.focus.longEvery} of ${prefs.focus.longEvery} focus sessions before a long break`}>
                {Array.from({ length: prefs.focus.longEvery }, (_, i) => (
                  <span key={i} className={cn("size-2 rounded-full", i < timer.cycle % prefs.focus.longEvery || (timer.phase === "long" && i < prefs.focus.longEvery) ? "bg-violet" : "bg-surface-3")} />
                ))}
              </div>
            )}
          </FocusOrb>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Button size="lg" className="min-w-36" onClick={toggleRun} aria-keyshortcuts="Space">
              {running ? <Pause /> : <Play />}
              {idle ? (timer.phase === "focus" ? "Start focus" : `Start ${PHASE_LABEL[timer.phase].toLowerCase()}`) : running ? "Pause" : "Resume"}
            </Button>
            {!idle && timer.phase === "focus" && (
              <Button size="lg" variant="outline" onClick={() => void stopAndSave()}>
                {mode === "stopwatch" ? <Square /> : <Save />} {mode === "stopwatch" ? "Finish" : "Stop & save"}
              </Button>
            )}
            {timer.phase !== "focus" && mode === "pomodoro" && (
              <Button size="lg" variant="outline" onClick={skipBreak}>
                <SkipForward /> Skip break
              </Button>
            )}
            {!idle && (
              <Button size="lg" variant="ghost" onClick={() => (elapsed > 60_000 && timer.phase === "focus" ? setConfirmDiscard(true) : discard())}>
                <RotateCcw /> Discard
              </Button>
            )}
          </div>

          {!zen && (
            <div className="mt-8 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="focus-task">
                  Working on
                </label>
                <Select value={timer.taskId ?? "none"} onValueChange={(v) => store.setTask(v === "none" ? null : v)}>
                  <SelectTrigger id="focus-task" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific task</SelectItem>
                    {openTasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="focus-area">
                  Counts toward
                </label>
                <Select value={linkedTask ? linkedTask.area : area} disabled={!!linkedTask} onValueChange={(v) => store.setArea(v as Area)}>
                  <SelectTrigger id="focus-area" className="h-10 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {AREA_META[a].label}
                        {linkedTask && " (from task)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "custom" && (
                <div className="space-y-3 sm:col-span-2">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Duration</span>
                    <span className="text-foreground tabular">{customMin} min</span>
                  </div>
                  <Slider min={5} max={180} step={5} value={[customMin]} disabled={!idle} onValueChange={([v]) => store.setCustomMin(v)} aria-label="Custom focus duration in minutes" />
                  <div className="flex flex-wrap gap-1.5">
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <button key={m} type="button" disabled={!idle} onClick={() => store.setCustomMin(m)} className={cn("rounded-control border px-3 py-1 text-xs", customMin === m ? "border-violet bg-violet/15" : "border-line text-muted-foreground hover:text-foreground")}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mode === "pomodoro" && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {prefs.focus.focusMin} min focus · {prefs.focus.shortBreakMin} min breaks · {prefs.focus.longBreakMin} min long break every {prefs.focus.longEvery}. Breaks {prefs.focus.autoStartBreaks ? "start automatically" : "wait for you"}.{" "}
                  <Link href="/settings#focus" className="underline underline-offset-2">
                    Change
                  </Link>
                </p>
              )}
            </div>
          )}

          <AmbientControls kind={ambientKind} volume={volume} onPlay={playAmbient} onVolume={(v) => {
            store.setVolume(v)
            ambient?.setVolume(v)
          }} compact={zen} />
        </div>

        {!zen && <FocusSidebar life={life} today={today} />}
      </div>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this session?</AlertDialogTitle>
            <AlertDialogDescription>{formatDuration(Math.round(elapsed / 60_000))} of focus won&apos;t be saved. Use &ldquo;Stop &amp; save&rdquo; to keep it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  )
}

const SOUNDS: { kind: AmbientKind; label: string; icon: typeof Waves }[] = [
  { kind: "off", label: "Off", icon: VolumeX },
  { kind: "rain", label: "Rain", icon: CloudRain },
  { kind: "brown", label: "Brown", icon: Waves },
  { kind: "pink", label: "Pink", icon: Wind },
  { kind: "white", label: "White", icon: Volume2 },
]

function AmbientControls({ kind, volume, onPlay, onVolume, compact }: { kind: AmbientKind; volume: number; onPlay: (k: AmbientKind) => void; onVolume: (v: number) => void; compact?: boolean }) {
  return (
    <div className={cn("mt-8 w-full max-w-2xl rounded-2xl border border-line p-4", compact && "max-w-md border-transparent")}>
      {!compact && (
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-medium">Ambient sound</span>
          <span className="text-[11px] text-muted-foreground">Generated in your browser, no downloads</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ambient sound">
          {SOUNDS.map((s) => (
            <button
              key={s.kind}
              type="button"
              role="radio"
              aria-checked={kind === s.kind}
              onClick={() => onPlay(s.kind)}
              className={cn("flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-xs transition-colors", kind === s.kind ? "border-transparent bg-foreground text-background" : "border-line text-muted-foreground hover:text-foreground")}
            >
              <s.icon className="size-3.5" />
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-36 flex-1 items-center gap-2">
          <Volume2 className="size-4 text-muted-foreground" />
          <Slider min={0} max={1} step={0.05} value={[volume]} onValueChange={([v]) => onVolume(v)} aria-label="Ambient volume" />
        </div>
      </div>
    </div>
  )
}

function FocusSidebar({ life, today }: { life: Life; today: string }) {
  const sessions = life.data.sessions
  const tasksById = new Map(life.data.tasks.map((t) => [t.id, t]))
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6)
        const minutes = Math.round(sessions.filter((s) => s.date === d).reduce((a, s) => a + s.actualSec / 60, 0))
        return { date: d, label: formatDay(d, "EEE"), minutes }
      }),
    [sessions, today],
  )
  const todayMin = week[6].minutes
  const weekMin = week.reduce((a, w) => a + w.minutes, 0)
  const streak = focusStreak(sessions, today)
  const recent = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8)

  const remove = async (s: FocusSession) => {
    if (!(await succeeded(() => deleteFocusSession(s.id)))) return
    toast("Session removed", { action: { label: "Undo", onClick: () => void attempt(() => recordFocusSession(s)) } })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Today" value={formatDuration(todayMin)} sub={`of ${formatDuration(life.prefs.focus.dailyTargetMin)}`} />
        <StatTile label="7 days" value={formatDuration(weekMin)} />
        <StatTile label="Streak" value={`${streak}d`} />
      </div>
      <ChartFrame title="This week" subtitle="Focus minutes per day" table={{ columns: ["Day", "Minutes"], rows: week.map((w) => [formatDay(w.date, "EEE d MMM"), w.minutes]) }}>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barCategoryGap="24%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" {...axisProps} interval={0} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={<ChartTooltip format={(v) => `${v} min`} labelFormat={(_, p) => formatDay(String(p?.date), "EEEE d MMM")} />} />
              <Bar dataKey="minutes" name="Focus" fill="var(--violet)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
      <Panel>
        <PanelHeader title="Session history" subtitle={`${sessions.length} sessions recorded`} />
        {recent.length === 0 ? (
          <EmptyState compact icon={Play} title="No sessions yet" body="Your first finished session will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((s) => {
              const task = s.taskId ? tasksById.get(s.taskId) : undefined
              return (
                <li key={s.id} className="group flex items-center gap-3 py-2.5">
                  <span className={cn("size-2 shrink-0 rounded-full", s.completed ? "bg-violet" : "bg-surface-3")} title={s.completed ? "Completed" : "Stopped early"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task?.title ?? (s.area ? `${AREA_META[s.area].label} focus` : "Focus")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(s.startedAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} · {s.completed ? "completed" : "stopped early"}
                      {s.demo && " · demo"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular">{formatDuration(Math.round(s.actualSec / 60))}</span>
                  <button type="button" onClick={() => void remove(s)} aria-label="Remove session" className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
