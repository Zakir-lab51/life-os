import type { FocusMode } from "./types"

export type FocusPhase = "focus" | "short" | "long"

/**
 * Timer state is pure timestamps, never a counter that ticks down. Elapsed
 * time is always `now - resumedAt` plus what accumulated before, so a
 * throttled background tab, a sleeping laptop or a page reload can't make
 * the timer drift.
 */
export interface TimerState {
  status: "idle" | "running" | "paused"
  mode: FocusMode
  phase: FocusPhase
  sessionId: string | null
  /** Epoch ms when this phase first started. */
  startedAt: number | null
  /** Epoch ms of the latest start/resume; null while paused. */
  resumedAt: number | null
  /** Running time collected before the latest resume. */
  accumulatedMs: number
  /** Length of this phase; null for the stopwatch. */
  plannedMs: number | null
  taskId: string | null
  /** Focus phases completed in the current pomodoro cycle. */
  cycle: number
}

export const IDLE_TIMER: TimerState = {
  status: "idle",
  mode: "pomodoro",
  phase: "focus",
  sessionId: null,
  startedAt: null,
  resumedAt: null,
  accumulatedMs: 0,
  plannedMs: null,
  taskId: null,
  cycle: 0,
}

export function elapsedMs(s: TimerState, now: number): number {
  const live = s.status === "running" && s.resumedAt !== null ? Math.max(0, now - s.resumedAt) : 0
  return s.accumulatedMs + live
}

export function remainingMs(s: TimerState, now: number): number | null {
  if (s.plannedMs === null) return null
  return Math.max(0, s.plannedMs - elapsedMs(s, now))
}

export function isFinished(s: TimerState, now: number): boolean {
  return s.status === "running" && s.plannedMs !== null && elapsedMs(s, now) >= s.plannedMs
}

/** Epoch ms at which a running countdown reaches zero. */
export function finishesAt(s: TimerState): number | null {
  if (s.status !== "running" || s.plannedMs === null || s.resumedAt === null) return null
  return s.resumedAt + (s.plannedMs - s.accumulatedMs)
}

export function start(s: TimerState, opts: { now: number; sessionId: string; plannedMs: number | null; phase?: FocusPhase; mode?: FocusMode; taskId?: string | null }): TimerState {
  return {
    ...s,
    status: "running",
    mode: opts.mode ?? s.mode,
    phase: opts.phase ?? s.phase,
    sessionId: opts.sessionId,
    startedAt: opts.now,
    resumedAt: opts.now,
    accumulatedMs: 0,
    plannedMs: opts.plannedMs,
    taskId: opts.taskId === undefined ? s.taskId : opts.taskId,
  }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== "running") return s
  return { ...s, status: "paused", accumulatedMs: elapsedMs(s, now), resumedAt: null }
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== "paused") return s
  return { ...s, status: "running", resumedAt: now }
}

/** Which phase follows a finished one in a pomodoro cycle. */
export function nextPhase(phase: FocusPhase, cycle: number, longEvery: number): { phase: FocusPhase; cycle: number } {
  if (phase === "focus") {
    const done = cycle + 1
    return { phase: done % Math.max(1, longEvery) === 0 ? "long" : "short", cycle: done }
  }
  return { phase: "focus", cycle: phase === "long" ? 0 : cycle }
}

export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Sessions shorter than this are discarded when stopped early. */
export const MIN_RECORDED_SEC = 60
