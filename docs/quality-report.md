# LIFE OS quality report

A running record of the reliability, motion and performance work: what was found, how it
was measured, what changed, and what is still limited. Numbers are from real runs; where
a measurement was flawed it says so.

## How things were measured

- **Probe:** `scripts/perf-probe.js`, pasted into (or loaded on) a running copy. It scrolls
  the page to the bottom and back over 300 frames (jumping instantly to each position, so
  every frame does real scrolling work), then watches 3 s of idle, and reports frame
  intervals (p50/p95/p99, share over 20 ms and 33 ms), long tasks, CLS and LCP.
- **Build:** the production static build (`npm run build:pages`), served locally, with
  the demo data loaded. Before and after builds were served from the same address, so
  they used identical data; the offline cache was cleared between runs.
- **Device:** the development PC (Windows, Chromium-based browser pane, 120 Hz display:
  idle frames arrive every 8.3 ms when nothing is costly), window 1280×860 at 1×.
- **Not measured:** the iPad (Safari draws the glass differently, with WebGL); low-end
  hardware; CPU or GPU throttling.

A first version of the probe scrolled with `scrollTo(x, y)`, which the page's smooth
scrolling (CSS `scroll-behavior` and Lenis) animated or overrode, so the page barely
moved. Those early "scroll" numbers were discarded; everything below uses the fixed probe
and reports how far the page actually scrolled (2563 of 2563 px in every run).

## Increment 1: reliability and scrolling performance

### Verified bugs

| # | Severity | Bug | Reproduce | Cause | Fix | Files |
|---|---|---|---|---|---|---|
| 1 | Medium (accessibility) | Closing a dialog, confirmation or the phone navigation drawer dropped keyboard focus to `<body>`. | Focus the top bar's search button, press Enter, then Escape: focus lands on the page body, not the button. | Radix dialogs only return focus to their own `Trigger`; LIFE OS opens every dialog from elsewhere (top bar, menus, shortcuts, other dialogs). | Content components remember what had focus when they opened and give it back on close (unless the caller moved focus, or that element is gone). | `components/ui/return-focus.ts`, `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`; test `tests/dialog-focus.test.tsx` |
| 2 | Medium (performance) | Scrolling a page of glass tiles ran at about 38 fps (median frame 26 ms; 83% of frames over 20 ms). | Run the probe on Overview at 1280×860. | Every glass tile bent its backdrop with an SVG displacement filter, re-run on every scrolled frame. Measured: removing the tiles' bend (sidebar and top bar still bending) brings frames to ~10 ms. | Tiles in the page bend only at rest: scrolling straightens them and the bend eases back in (450 ms) when scrolling stops. The sidebar, top bar and dialogs keep bending. Adaptive quality levels shed more if a device still can't keep up. | `features/shell/refraction.tsx`, `canvas-refraction.tsx`, `lib/design/quality.ts`, `features/shell/quality-monitor.tsx`; test `tests/quality.test.ts` |

The dialog test fails with the fix switched off (3 of 4 cases) and passes with it.

### Checked and fine

- No console errors or uncaught rejections while visiting every page.
- No horizontal overflow on any page at 1280 px; none on Overview at 390 px.
- Wheel scrolling over a dialog's backdrop doesn't move the page; Escape closes dialogs
  and scrolling resumes.
- Reduce motion: a global rule already cuts every CSS animation and transition short;
  Lenis, the Liquid flow, the watch and the scroll-linked tiles each check it too.
- "Skip to content" moves focus to the page.
- Dragging a card between Kanban columns works.

### Retracted

- **Small touch targets.** A first scan measured the task tick-boxes at 17–20 px. They
  already carry an invisible enlarged hit area; hit-testing measured 40–42 × 33–35 px,
  above the 24 px minimum. Not a bug; raising them to 44 px on touch screens is listed
  as a refinement instead.

### Measurements: Overview, 1280×860, production build

| | Before | After | Change |
|---|---|---|---|
| Scroll: median frame | 26.2 ms (~38 fps) | 12.2 ms (~82 fps) | 2.1× faster |
| Scroll: p95 frame | 34.0 ms | 24.0 ms | −29% |
| Scroll: frames over 20 ms | 83% | 10% | |
| Scroll: frames over 33 ms | 7.5% | 0.7% | |
| Idle: median frame | 16.8 ms (60 fps) | 16.8 ms (60 fps) | unchanged |
| Long tasks (> 50 ms) | 0 | 0 | |
| CLS | 0.0011 | 0.0011 | |
| LCP | 380 ms | 424 ms | within run-to-run noise |

Averages of two runs each. What each effect costs (same page, new build):

| Quality level | Scroll median | Idle median |
|---|---|---|
| 0 full (tiles bend at rest) | 12.2 ms | 16.8 ms |
| 1 balanced (tiles never bend) | 10.6 ms | 9.7 ms |
| 1 with the background held still | | 8.4 ms |

At rest, bent tiles re-filter every time the animated background moves, which caps idle
at 60 fps on this PC. That meets the 60 fps target, so full stays the default here; the
quality monitor steps down when a device can't hold about 50 fps.

### Limitations

- Safari (the iPad) wasn't measured. Its glass bending comes from the WebGL background
  and was already rest-only for tiles; the quality levels apply there too.
- `npm audit` reports high-severity advisories in `fast-glob` via the `shadcn` CLI, a
  development tool that isn't shipped in the app.

## Increment 2: motion and micro-interactions

Built on the existing system (Motion + CSS springs), no new animation library. Spec:
`docs/design-system.md`.

| Change | Where | Verified |
|---|---|---|
| Tick-boxes pop and draw their check when ticked | `components/ui/checkbox.tsx`, globals.css | In the production build: `pop-in` and `check-draw` run on tick |
| Ticks pop even when the row is rebuilt (open and done tasks listed apart) | `wasJustCompleted` in `features/tasks/task-actions.ts` | Test `tests/task-pop.test.ts`; in the browser the first try (before this) showed no pop, after it the pop ran |
| Done titles: strike and muted colour fade in | `strike` / `is-done` utility, 8 call sites | Computed style shows the transition and the strike colour once done |
| Habit check-ins pop with a ring in the habit's colour | `components/os/habit-mark.tsx` | `pop-in` and `pop-ring` run on check-in |
| Nothing pops on page load | `lib/use-just-changed.ts` | Loading Habits with done habits runs only the ambient animations; test `tests/just-changed.test.tsx` |
| Stat numbers roll when they change | `StatTile` uses `RollingText` | (initial render doesn't animate) |
| New notifications pop the bell badge | `topbar.tsx` | not exercised in the browser (needs a new notification) |
| Toasts are glass | `components/ui/sonner.tsx` | |
| Tick-boxes answer to a 44 px square on touch screens | globals.css `(pointer: coarse)` | |

## Increment 3: touch-first phone layout

Phones (under 768 px) get a floating glass tab bar at the bottom, within thumb reach, in
place of the desktop sidebar squeezed into a drawer: Overview, My Day, Tasks, Habits, and
More (which opens the full drawer and shows the current section's name when you're
elsewhere). `features/shell/tab-bar.tsx`.

Checked in the production build at 375×812:

- Each tab is a column about 64 × 52 px; the highlighter glides to the selected tab.
- Switching tabs navigates and marks the tab `aria-current="page"`; More opens the drawer;
  Escape closes it and focus returns to More (increment 1's fix, seen in the browser).
- On Overview, My Day, Tasks and Habits, scrolled to the bottom, the last content ends
  15–25 px above the bar, and nothing overflows sideways.
- Toasts sit above the bar (`mobileOffset`); the page's bottom padding includes the
  home-indicator area.
- At 768 px the bar hides and the top bar's ☰ returns (iPad portrait is unchanged).

