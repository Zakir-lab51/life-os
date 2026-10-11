import { create } from "zustand"

/*
  Rendering quality. The glass effects cost GPU time on every frame the content behind
  them changes, and devices differ a lot, so LIFE OS watches how fast frames actually
  arrive (quality-monitor.tsx) and steps the most expensive effects down when a device
  can't keep up. Levels, from richest to lightest:

    0  full      page tiles bend at rest (never while scrolling); sidebar, top bar
                 and dialogs always bend; Liquid flow moves at 30 fps
    1  balanced  page tiles don't bend; the rest as above
    2  light     nothing bends; Liquid flow at 30 fps
    3  still     nothing bends; Liquid flow holds still

  A level reached in a session sticks for that session (no flip-flopping); a new
  session starts at full again. localStorage "life-os.quality" = "0".."3" pins a level,
  for testing.
*/

export type QualityLevel = 0 | 1 | 2 | 3

export interface QualityProfile {
  /** Page tiles bend while the page is at rest. */
  tilesBend: boolean
  /** Sidebar, top bar and dialogs bend. */
  chromeBends: boolean
  /** Liquid flow frame rate; 0 holds it still. */
  flowFps: number
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  0: { tilesBend: true, chromeBends: true, flowFps: 30 },
  1: { tilesBend: false, chromeBends: true, flowFps: 30 },
  2: { tilesBend: false, chromeBends: false, flowFps: 30 },
  3: { tilesBend: false, chromeBends: false, flowFps: 0 },
}

const SESSION_KEY = "life-os.quality"
const PIN_KEY = "life-os.quality"

const read = (store: () => Storage): QualityLevel | null => {
  try {
    const v = Number(store().getItem(PIN_KEY))
    return v === 0 || v === 1 || v === 2 || v === 3 ? (v as QualityLevel) : null
  } catch {
    return null
  }
}

/** A level pinned for testing, if any. */
export const pinnedQuality = () => (typeof window === "undefined" ? null : read(() => localStorage))

function initial(): QualityLevel {
  if (typeof window === "undefined") return 0
  return pinnedQuality() ?? read(() => sessionStorage) ?? 0
}

export const useQuality = create<{ level: QualityLevel; stepDown: () => void }>((set, get) => ({
  level: initial(),
  stepDown: () => {
    const level = Math.min(3, get().level + 1) as QualityLevel
    try {
      sessionStorage.setItem(SESSION_KEY, String(level))
    } catch {
      // storage blocked: the level still applies until reload
    }
    set({ level })
  },
}))

/**
 * Is a window of frame intervals (ms) too slow? Slow means the typical frame misses
 * 50 fps, or one frame in ten takes longer than two at 60 Hz: either way motion visibly
 * stutters. Short windows prove nothing.
 */
export function framesTooSlow(intervals: number[]): boolean {
  if (intervals.length < 30) return false
  const sorted = [...intervals].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]
  return at(0.5) > 20 || at(0.9) > 34
}
