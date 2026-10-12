/**
 * The Liquid flow's own clock, in seconds. It runs while the flow animates and holds while
 * it's paused (under a dialog or drawer, in a hidden tab), so the flow freezes on the frame
 * showing and carries on from it. A gap longer than a few frames counts as a pause and
 * moves the clock on by one frame only.
 */
export function createFlowClock(start: number, frameMs = 1000 / 30, pauseAfterMs = 100) {
  let clock = start
  let at = 0
  return {
    /** The time to draw at `now` (ms); `running` is whether the flow is animating. */
    tick(now: number, running: boolean): number {
      if (!running) {
        at = 0
        return clock
      }
      const step = at ? Math.max(0, now - at) : 0
      clock += (step > pauseAfterMs ? frameMs : step) / 1000
      at = now
      return clock
    },
  }
}
