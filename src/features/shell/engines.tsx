"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { playChime } from "@/lib/audio/ambient"
import { db } from "@/lib/db/db"
import { useToday, useUnlocks, usePrefs } from "@/lib/db/hooks"
import { ensureSeriesBlocks, notify, recordFocusSession, recordUnlocks, takeDueReminders, updatePrefs } from "@/lib/db/repo"
import { addDays, formatDuration, relativeDayLabel, toISODate, todayISO } from "@/lib/domain/dates"
import { SERIES_AHEAD_DAYS } from "@/lib/domain/series"
import { IDLE_TIMER, MIN_RECORDED_SEC, elapsedMs, finishesAt, formatTimer, isFinished, nextPhase, remainingMs, start, type TimerState } from "@/lib/domain/focus"
import type { Area, Prefs } from "@/lib/domain/types"
import { useFocus } from "@/lib/stores/focus"
import { uid } from "@/lib/utils"
import { celebrationsMuted, evaluateProgress } from "./progress"
import { useLife } from "./use-life"

export function showBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico", tag: `life-os-${title}` })
    }
  } catch {
    // some browsers only allow notifications from a service worker; in-app ones still show
  }
}

/**
 * Saves a focus session from timer state. `endMs` is when it actually ended,
 * which may be in the past if the tab was asleep. Short early stops are dropped.
 */
export async function finalizeFocus(timer: TimerState, endMs: number, completed: boolean, fallbackArea: Area) {
  if (timer.phase !== "focus" || !timer.sessionId || timer.startedAt === null) return false
  const elapsed = Math.min(elapsedMs(timer, endMs), timer.plannedMs ?? Number.POSITIVE_INFINITY)
  const actualSec = Math.round(elapsed / 1000)
  if (!completed && actualSec < MIN_RECORDED_SEC) return false
  const task = timer.taskId ? await db.tasks.get(timer.taskId) : undefined
  return recordFocusSession({
    id: timer.sessionId,
    mode: timer.mode,
    date: toISODate(new Date(timer.startedAt)),
    startedAt: new Date(timer.startedAt).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    plannedSec: timer.plannedMs === null ? null : Math.round(timer.plannedMs / 1000),
    actualSec,
    taskId: task?.id ?? null,
    area: task?.area ?? fallbackArea,
    completed,
  })
}

function phaseMinutes(phase: TimerState["phase"], prefs: Prefs) {
  return phase === "focus" ? prefs.focus.focusMin : phase === "short" ? prefs.focus.shortBreakMin : prefs.focus.longBreakMin
}

/** Watches the timer from anywhere in the app: records finished sessions and moves the pomodoro cycle on. */
export function FocusEngine() {
  const prefs = usePrefs()
  const originalTitle = useRef<string | null>(null)
  const timerTitle = useRef("")

  useEffect(() => {
    if (!prefs) return
    let busy = false

    const tick = async () => {
      if (busy) return
      const { timer, setTimer, area } = useFocus.getState()
      const now = Date.now()

      if (timer.status === "idle") {
        if (originalTitle.current !== null) {
          document.title = originalTitle.current
          originalTitle.current = null
        }
        return
      }
      // a title we didn't write is the page's own (it changes when you move to another
      // page mid-session); that's the one to put back when the timer stops
      if (originalTitle.current === null || document.title !== timerTitle.current) originalTitle.current = document.title
      const label = timer.phase === "focus" ? "Focus" : "Break"
      const rem = remainingMs(timer, now)
      timerTitle.current = `${timer.status === "paused" ? "⏸ " : ""}${formatTimer(rem ?? elapsedMs(timer, now))} · ${label} · LIFE OS`
      document.title = timerTitle.current

      if (!isFinished(timer, now)) return
      busy = true
      try {
        const endMs = finishesAt(timer) ?? now
        if (timer.phase === "focus") {
          await finalizeFocus(timer, endMs, true, area)
          const minutes = Math.round((timer.plannedMs ?? 0) / 60_000)
          const task = timer.taskId ? await db.tasks.get(timer.taskId) : undefined
          playChime()
          toast.success(`Focus complete · ${formatDuration(minutes)}`, { description: task ? task.title : "Session saved to your history." })
          if (prefs.notifications.focus) {
            await notify({ kind: "focus", title: `Focus session complete`, body: `${formatDuration(minutes)}${task ? ` on ${task.title}` : ""}. Time for a break.`, href: "/focus" })
            if (prefs.notifications.browser) showBrowserNotification("Focus session complete", "Time for a break.")
          }
        } else {
          playChime()
          toast("Break's over", { description: "Ready for the next focus session?" })
          if (prefs.notifications.browser && prefs.notifications.focus) showBrowserNotification("Break's over", "Ready for the next focus session?")
        }

        if (timer.mode === "pomodoro") {
          const np = nextPhase(timer.phase, timer.cycle, prefs.focus.longEvery)
          const autoStart = timer.phase === "focus" && prefs.focus.autoStartBreaks
          if (autoStart) {
            setTimer({
              ...start(timer, { now: endMs, sessionId: uid("f_"), plannedMs: phaseMinutes(np.phase, prefs) * 60_000, phase: np.phase, mode: "pomodoro" }),
              cycle: np.cycle,
            })
          } else {
            setTimer({ ...IDLE_TIMER, mode: "pomodoro", phase: np.phase, cycle: np.cycle, taskId: timer.taskId })
          }
        } else {
          setTimer({ ...IDLE_TIMER, mode: timer.mode, taskId: timer.taskId })
        }
      } finally {
        busy = false
      }
    }

    const id = window.setInterval(() => void tick(), 500)
    const onVisible = () => void tick()
    document.addEventListener("visibilitychange", onVisible)
    void tick()
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [prefs])

  return null
}

/** Fires task reminders while the app is open (there's no background push in local mode). */
export function ReminderEngine() {
  const prefs = usePrefs()
  useEffect(() => {
    if (!prefs?.notifications.reminders) return
    const check = async () => {
      const due = await takeDueReminders()
      const today = todayISO()
      for (const t of due) {
        const body = t.dueDate ? `Due ${relativeDayLabel(t.dueDate, today).toLowerCase()}` : "Reminder"
        await notify({ kind: "reminder", title: t.title, body, href: "/tasks" })
        toast(`Reminder: ${t.title}`, { description: body })
        if (prefs.notifications.browser) showBrowserNotification(`Reminder: ${t.title}`, body)
      }
    }
    void check()
    const id = window.setInterval(() => void check(), 30_000)
    return () => window.clearInterval(id)
  }, [prefs])
  return null
}

/** Celebrates newly earned achievements and level-ups, exactly once each. */
export function ProgressWatcher() {
  const life = useLife()
  const unlocks = useUnlocks()
  const firstRun = useRef(true)
  // guards against celebrating twice while the unlock write is still in flight
  const announced = useRef(new Set<string>())
  const announcedLevel = useRef(0)

  useEffect(() => {
    if (!life || !unlocks) return
    const { earned, level } = evaluateProgress(life.data, life.today)
    const have = new Set(unlocks.map((u) => u.id))
    const fresh = earned.filter((a) => !have.has(a.id) && !announced.current.has(a.id))
    // the first evaluation after opening the app records silently: nothing was "just" earned
    const celebrate = !firstRun.current && !celebrationsMuted()
    firstRun.current = false

    if (fresh.length) {
      for (const a of fresh) announced.current.add(a.id)
      void recordUnlocks(fresh.map((a) => a.id))
      if (celebrate && life.prefs.notifications.achievements) {
        for (const a of fresh.slice(0, 3)) {
          toast.success(`Achievement unlocked: ${a.title}`, { description: a.description })
          void notify({ kind: "achievement", title: `Achievement: ${a.title}`, body: a.description, href: "/habits#progress" })
        }
      }
    }
    if (level.level > life.prefs.lastSeenLevel && level.level > announcedLevel.current) {
      announcedLevel.current = level.level
      void updatePrefs({ lastSeenLevel: level.level })
      if (celebrate && life.prefs.lastSeenLevel > 0) {
        toast.success(`Level ${level.level} · ${level.title}`, { description: "Steady effort, compounding." })
        if (life.prefs.notifications.achievements) void notify({ kind: "level", title: `You reached level ${level.level}`, body: level.title, href: "/habits#progress" })
      }
    }
  }, [life, unlocks])

  return null
}

/**
 * Keeps repeating blocks on the timeline four weeks ahead: on start, on each new day, and
 * whenever a series is added (here or, with sync, on another device).
 */
export function SeriesEngine() {
  const today = useToday()
  const series = useLiveQuery(() => db.blockSeries.count(), [])
  useEffect(() => {
    if (!series) return
    void ensureSeriesBlocks(today, addDays(today, SERIES_AHEAD_DAYS)).catch(() => undefined)
  }, [today, series])
  return null
}
