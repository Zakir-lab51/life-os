/*
  LIFE OS performance probe. Paste into the browser console on a running copy (the
  production build, ideally: `npm run build:pages` and serve out/) and run
  `await lifeOsProbe()`. It measures on this device, with this window size:

  - scroll: frame intervals while the page scrolls to the bottom and back over
    `scrollFrames` frames (p50/p95/p99, and the share of frames slower than 20 ms and
    33 ms, i.e. missed at 60 Hz and below 30 fps);
  - idle: frame intervals while nothing happens for `idleMs`;
  - long tasks (main-thread work over 50 ms) in each phase;
  - layout shift (CLS) and largest contentful paint since the page loaded;
  - input: the slowest real (trusted) clicks and key presses since the probe was
    installed, from the Event Timing API (an INP-like figure).

  Install it as early as possible (it starts listening when pasted), use the app,
  then call lifeOsProbe(). Synthetic events don't count as input: click for real.
*/
;(() => {
  const state = { lcp: 0, cls: 0, events: [] }
  const observe = (type, fn, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra })
    } catch {
      // entry type not supported here
    }
  }
  observe("largest-contentful-paint", (e) => (state.lcp = e.startTime))
  observe("layout-shift", (e) => {
    if (!e.hadRecentInput) state.cls += e.value
  })
  observe("event", (e) => state.events.push({ name: e.name, duration: e.duration, target: e.target?.getAttribute?.("aria-label") || e.target?.textContent?.trim().slice(0, 30) || e.target?.tagName }), { durationThreshold: 16 })

  const frame = () => new Promise((r) => requestAnimationFrame(r))
  const stats = (times) => {
    const s = [...times].sort((a, b) => a - b)
    const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(1)
    return { frames: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), over20ms: +(s.filter((t) => t > 20).length / s.length).toFixed(3), over33ms: +(s.filter((t) => t > 33.4).length / s.length).toFixed(3) }
  }
  const longTasks = () => {
    const tasks = []
    let po = null
    try {
      po = new PerformanceObserver((l) => l.getEntries().forEach((e) => tasks.push(e.duration)))
      po.observe({ type: "longtask" })
    } catch {
      // not supported
    }
    return () => {
      po?.disconnect()
      return { count: tasks.length, totalMs: Math.round(tasks.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...tasks)) }
    }
  }

  window.lifeOsProbe = async ({ scrollFrames = 300, idleMs = 3000 } = {}) => {
    const max = document.documentElement.scrollHeight - innerHeight
    // "instant": the page scrolls smoothly by default (CSS and Lenis), which would turn
    // each step into its own animation and leave the page barely moving
    const jump = (top) => window.scrollTo({ top, behavior: "instant" })
    jump(0)
    await new Promise((r) => setTimeout(r, 1000))

    // scroll down and back up along a smooth curve, one step per frame
    let stop = longTasks()
    const scroll = []
    let deepest = 0
    let last = (await frame(), performance.now())
    for (let i = 1; i <= scrollFrames; i++) {
      jump(max * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / scrollFrames)))
      await frame()
      deepest = Math.max(deepest, scrollY)
      const now = performance.now()
      scroll.push(now - last)
      last = now
    }
    const scrollLong = stop()
    jump(0)
    await new Promise((r) => setTimeout(r, 800))

    stop = longTasks()
    const idle = []
    const end = performance.now() + idleMs
    last = (await frame(), performance.now())
    while (performance.now() < end) {
      await frame()
      const now = performance.now()
      idle.push(now - last)
      last = now
    }
    const idleLong = stop()

    const slowest = [...state.events].sort((a, b) => b.duration - a.duration).slice(0, 5)
    const result = {
      page: location.pathname,
      viewport: `${innerWidth}x${innerHeight} @${devicePixelRatio}x`,
      scrollHeight: max + innerHeight,
      // the deepest the page actually went (should be close to scrollHeight - innerHeight)
      scrollReached: Math.round(deepest),
      glassSurfaces: document.querySelectorAll(".glass").length,
      scroll: { ...stats(scroll), longTasks: scrollLong },
      idle: { ...stats(idle), longTasks: idleLong },
      lcpMs: Math.round(state.lcp),
      cls: +state.cls.toFixed(4),
      input: { count: state.events.length, slowestMs: slowest.map((e) => `${Math.round(e.duration)} ${e.name} ${e.target}`) },
    }
    console.log("LIFE OS probe", result)
    return result
  }
})()
