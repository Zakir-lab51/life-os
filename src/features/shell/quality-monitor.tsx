"use client"

import { useEffect } from "react"
import { framesTooSlow, pinnedQuality, useQuality } from "@/lib/design/quality"

/*
  Watches real frame times and steps rendering quality down (lib/design/quality.ts)
  when this device can't keep up. Every SAMPLE_EVERY ms, while the page is visible, it
  times frames for SAMPLE_FOR ms; two slow samples in a row step down one level, so a
  single heavy moment (opening a page, say) never does. It never steps back up within a
  session, and does nothing when a level is pinned or motion is reduced.
*/
const SAMPLE_EVERY = 12_000
const SAMPLE_FOR = 1_500

export function QualityMonitor() {
  useEffect(() => {
    if (pinnedQuality() !== null) return
    const reduced = () => document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches
    let slowInARow = 0
    let raf = 0
    let timer: ReturnType<typeof setTimeout>

    const sample = () => {
      if (document.hidden || reduced() || useQuality.getState().level >= 3) {
        timer = setTimeout(sample, SAMPLE_EVERY)
        return
      }
      const intervals: number[] = []
      const end = performance.now() + SAMPLE_FOR
      let last = 0
      const tick = (now: number) => {
        if (last) intervals.push(now - last)
        last = now
        if (now < end && !document.hidden) {
          raf = requestAnimationFrame(tick)
          return
        }
        slowInARow = framesTooSlow(intervals) ? slowInARow + 1 : 0
        if (slowInARow >= 2) {
          slowInARow = 0
          useQuality.getState().stepDown()
        }
        timer = setTimeout(sample, SAMPLE_EVERY)
      }
      raf = requestAnimationFrame(tick)
    }
    timer = setTimeout(sample, SAMPLE_EVERY)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [])
  return null
}
