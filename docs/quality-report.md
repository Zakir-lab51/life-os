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

## Increment 4: readability over the Liquid flow

### Verified bug

| # | Severity | Bug | Reproduce | Cause | Fix | Files |
|---|---|---|---|---|---|---|
| 3 | Medium (accessibility) | Secondary text (dates, counts, labels, hints) fell below the WCAG AA contrast minimum (4.5:1) over the vivid default background: on Overview, 22 of 47 texts in dark mode (lowest 2.15:1) and 12 of 47 in light mode. | Default look, Overview at 1100×760; measure each text against the pixels behind it (method below). | The secondary colour was tuned for an opaque card, but tiles are 28% glass over a bright, moving background. Dark glass let the bright ribbons through at full strength. Text straight on the background (page headers, filter chips) had nothing behind it. Past timeline blocks (60% opacity) and planned sidebar sections (70% opacity on 85% text) faded text further. | Dark glass dims what shows through it (brightness 0.72), like Apple's dark materials; secondary text one step lighter in dark mode (L 0.68 → 0.77) and darker in light mode (0.5 → 0.37). Text with no glass behind it gets its own colour (`text-muted-backdrop`) and a soft halo in the page colour (`on-backdrop`). Past blocks lose their colour instead of fading; planned sections use the secondary colour instead of stacked fades. The light highlighter goes from 60% to 70% so white labels hold over pale areas. | `app/globals.css`, `components/os/page-header.tsx`, `features/overview/overview-view.tsx`, `features/tasks/tasks-view.tsx`, `features/goals/goals-view.tsx`, `features/analytics/analytics-view.tsx`, `features/planner/my-day-view.tsx`, `features/planner/timeline.tsx`, `features/shell/sidebar.tsx`, `lib/design/scene.ts`; test `tests/text-contrast.test.ts` |

The test models the page from the real tokens and the flow's own shading at its
extremes (each ribbon at its darkest, under the next one's shadow, and brightest, at its
edge in the sheen), for every colour preset in both themes: secondary text on tiles,
secondary text straight on the background (with the halo), and the selected item's
label on its highlighter. It fails on the old tokens (tiles in both themes; the
highlighter) and passes now. The shading constants moved into `FLOW_SHADE` in
`scene.ts`, which both the shader and the test read, so they can't drift apart.

### Method

The production build, demo data, default look. In the page, every visible text's
computed colour (including inherited opacity) and box; a screenshot; then for each text,
the contrast between its colour (blended by its alpha) and the median of the screenshot
pixels in its box (`scripts/contrast-probe.js` and `scripts/contrast-measure.py`). The background moves, so a
screenshot is one moment; the test covers the extremes.

### Measurements

| | Before | After |
|---|---|---|
| Overview, dark: texts below AA | 22 of 47 | 1 of 47 * |
| Overview, dark: secondary text, lowest / median | 2.15 / 3.91 | 4.61 / 5.96 |
| Overview, light: texts below AA | 12 of 47 | 1 of 47 * |
| Overview, light: secondary text, lowest / median | 3.60 / 5.02 | 5.96 / 8.36 |
| Tasks (filters in view), light: texts below AA | 1 of 47 (chip 4.46) † | 0 of 47 (lowest 6.22) |
| Tasks (filters in view), dark: texts below AA | | 1 of 47 ‡ |
| My Day, dark: a past block's time | 2.96 | 5.82 |
| Sidebar planned sections, dark | 4.13–4.48 | 4.68 and up |
| Phone 375×812, Tasks: selected tab's label, light | 4.19 | 5.84 |
| Phone 375×812, Tasks: texts below AA, light / dark | | 0 of 12 / 0 of 12 |

\* The "01" priority badge: its box is almost all the badge's own fill, which the
pixel median doesn't separate from the text. Measured against the fill directly it is
8.5:1 (dark) and 5.3:1 (light).
† Mid-way through this increment, before the halo.
‡ A small "demo" tag at 4.35, where the sample box takes in the tag's border.

Also checked: the halo is invisible as such in both themes (it only lifts the background
right around the letters); the "Today" button that measured 4.3 is disabled, which AA
exempts.

### Limitations

- Only the Liquid flow is modelled. A photo background the user chooses can be anything;
  the Background dim slider (Settings → Appearance) veils a busy one.
- Archived goals still fade (70% opacity on the tile), which also weakens the tile's blur.
  Archived is an inactive state, so it was left as it is.
- The final frame-timing re-measurement couldn't be run: the browser pane was throttled
  to about 2 frames per second (the app window was in the background), which makes frame
  timing meaningless. This increment changes colour values, one value in a filter the
  glass already ran, and a text shadow on a few header lines per page, so no cost is
  expected, but it is not measured. The numbers in increment 1 are the latest real ones.
