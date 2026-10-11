"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./safe-storage"
import { IDLE_TIMER, pause, resume, start, type FocusPhase, type TimerState } from "@/lib/domain/focus"
import type { Area, FocusMode } from "@/lib/domain/types"
import { uid } from "@/lib/utils"

export type AmbientKind = "off" | "white" | "pink" | "brown" | "rain"

interface FocusStore {
  timer: TimerState
  /** Minutes for "custom" mode. */
  customMin: number
  /** Area credited when the session isn't linked to a task. */
  area: Area
  ambient: AmbientKind
  volume: number

  begin: (opts: { mode: FocusMode; phase?: FocusPhase; minutes: number | null; taskId?: string | null }) => void
  pauseTimer: () => void
  resumeTimer: () => void
  reset: () => void
  /** Replaces the timer wholesale (used by the engine after a phase ends). */
  setTimer: (timer: TimerState) => void
  setTask: (taskId: string | null) => void
  setCustomMin: (min: number) => void
  setArea: (area: Area) => void
  setAmbient: (kind: AmbientKind) => void
  setVolume: (v: number) => void
}

/**
 * The running timer is persisted, so a reload or a closed tab picks up
 * exactly where it was: elapsed time is recomputed from timestamps.
 */
export const useFocus = create<FocusStore>()(
  persist(
    (set, get) => ({
      timer: IDLE_TIMER,
      customMin: 45,
      area: "work",
      ambient: "off",
      volume: 0.4,

      begin: ({ mode, phase = "focus", minutes, taskId }) =>
        set({
          timer: start(
            { ...get().timer, cycle: mode === "pomodoro" ? get().timer.cycle : 0 },
            {
              now: Date.now(),
              sessionId: uid("f_"),
              plannedMs: minutes === null ? null : minutes * 60_000,
              phase,
              mode,
              taskId,
            },
          ),
        }),
      pauseTimer: () => set({ timer: pause(get().timer, Date.now()) }),
      resumeTimer: () => set({ timer: resume(get().timer, Date.now()) }),
      reset: () => set({ timer: { ...IDLE_TIMER, mode: get().timer.mode, taskId: get().timer.taskId } }),
      setTimer: (timer) => set({ timer }),
      setTask: (taskId) => set({ timer: { ...get().timer, taskId } }),
      setCustomMin: (customMin) => set({ customMin }),
      setArea: (area) => set({ area }),
      setAmbient: (ambient) => set({ ambient }),
      setVolume: (volume) => set({ volume }),
    }),
    {
      name: "life-os.focus",
      storage: safeStorage,
      skipHydration: true,
      // ambient sound needs a click to start, so it isn't restored as "playing"
      partialize: (s) => ({ timer: s.timer, customMin: s.customMin, area: s.area, volume: s.volume }),
    },
  ),
)
