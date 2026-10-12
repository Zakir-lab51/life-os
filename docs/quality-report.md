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

## Increment 5: a fixed glass finish

The user's choice: remove the design studio's sliders (accent colour, colour intensity,
corner roundness, background glow, interface size), the Frosted / Liquid glass choice and
the glass Transparency and Blur sliders, and keep the glass always at 100% transparency
with a 1 px blur, the background with no dimming and no blur.

- `FIXED_FINISH` in `lib/design/design.ts` (liquid, transparency 1, blur 1 px, dimming 0,
  background blur 0). `designToVars` and `migratePrefs` both apply it, so older saved
  designs, backups and pasted design codes still load; their glass and background values
  are replaced. Looks, font and background choice stay in Settings → Appearance.
- Menus, dialogs and sheets keep their own heavier frosting (28 px over a mostly solid
  fill): they sit on top of the page's own text.
- Tests: `tests/design.test.ts` checks that any design paints with the fixed finish and that
  saved designs are brought to it while keeping their look, photo and font.

### Effect on readability, and what was done

Clear glass with a 1 px blur and no dimming lets the vivid flow through almost untouched.
Measured on Overview (1100×760) straight after the change: 18 of 47 texts below AA in dark
mode (secondary text: lowest 2.54, median 3.82), 5 of 47 in light mode. A soft halo on all
glass text barely helped (15 of 47). Letting dark glass darken what shows through it more
(brightness 0.5, from 0.72) did: 3 of 47, with transparency, blur and dimming unchanged.
The user chose that. Text straight on the background was nudged too (`--muted-backdrop`
0.32 light, 0.88 dark).

`tests/text-contrast.test.ts` was rewritten for this finish. It now enforces what the clear
glass can promise: AA over the body of every ribbon (every preset) for dark-mode tiles and
for text straight on the background; the highlighter's label over the brightest dark glass;
and for light-mode tiles, a floor (2.8:1) that keeps them from getting worse. The dark-tile
check fails at the old 0.72 brightness.

| Overview, final build | Dark | Light |
|---|---|---|
| Texts below AA | 2 of 45 * | 5 of 45 * |
| Secondary text, lowest / median | 3.92 / 5.85 | 2.86 / 5.51 |

\* Each includes the "01" badge (see increment 4). Dark: the briefing's "Rule-based ·
updates as you work" line at 3.92. Light: small labels in the hero tile's right column
(Tasks, Focus, "1 of 5 due or finished") over saturated pink and blue, and the top bar's
"LIFE OS" at 3.89.

## Final validation

### Frame timing, final build

Same probe, page and window (Overview, 1280×860, production build, 120 Hz display),
averaged over two runs. Conditions differ a little from the baseline: the demo data had
changed (the page is shorter) and the sidebar was collapsed, as the user had left it.

| | Before increment 1 | After increment 1 | Final (fixed finish) |
|---|---|---|---|
| Scroll: median frame | 26.2 ms | 12.2 ms | 14.3 ms |
| Scroll: p95 frame | 34.0 ms | 24.0 ms | 18.4 ms |
| Scroll: frames over 20 ms | 83% | 10% | 3.8% |
| Scroll: frames over 33 ms | 7.5% | 0.7% | 0.3% |
| Idle: median frame | 16.8 ms | 16.8 ms | 16.9 ms |
| Long tasks (> 50 ms) | 0 | 0 | 0 |
| CLS | 0.0011 | 0.0011 | 0.0028 |

The quality monitor stayed at full quality. Idle still runs at 60 fps (the bent tiles
re-filter as the flow moves); 15–18% of idle frames took 20–25 ms. The probe's input figure
(200 ms pointer events) came from the pointer moving over the pane during the forced
scrolling and isn't a fair measure of input delay, so it's left out.

### Remaining limitations

- Light-mode secondary text on tiles falls below AA over the darker ribbons (the clear glass
  adds almost nothing there); dark mode and text straight on the background meet it over
  ribbon bodies, but thin edge highlights can dip below.
- The iPad (Safari, WebGL glass) wasn't measured, for frame timing or contrast.
- Glass bending stays rest-only for page tiles; the quality levels cover slower devices.
- `npm audit` advisories in the `shadcn` CLI's dependencies (development only).
- Not exercised in a browser: the bell badge's pop on a new notification, and the
  timeline's tick-box hit area on touch.
- Not started from the spec: further refinement of widgets, forms, charts, dialogs and the
  Kanban board; designed empty, loading and error states; shared-element transitions.

## Increment 6: Kanban, forms, dialogs, charts, widgets; empty, loading and error states

### Verified bugs

| # | Severity | Bug | Reproduce | Cause | Fix | Files |
|---|---|---|---|---|---|---|
| 4 | High (data loss) | Escape, a click outside or ✕ closed the task, goal, habit and time-block editors and threw away unsaved typing. | Open New task, type a title, press Escape. | The dialogs closed on every close request. | A close guard: with unsaved changes the editor stays open and asks "Discard your changes?" (Keep editing / Discard). Saving, Cancel and Discard close at once. | `components/os/editor-guard.tsx`, the four editors; test `tests/editor-guard.test.tsx` (fails without the guard) |
| 5 | High (touch) | On the iPad and phones, swiping over a Kanban card didn't scroll the page. | Board view on a touch screen, swipe up over a card. | Cards had `touch-action: none` for pointer-based dragging. | Mouse drags start after 6 px; touch drags start on a 220 ms press-and-hold, and cards use `touch-action: manipulation`. | `features/tasks/task-board.tsx` |
| 6 | Medium | A dropped Kanban card flew back to its old column, then jumped to the new one. | Drag a card to another column. | The card stayed in its old column until the database write landed. | While dragging, the card's place moves to the column under it; after a drop the move shows at once and the write catches up (a blocked move is put back). | `task-board.tsx`, `board-layout.ts`; test `tests/board-layout.test.ts` (it also caught a sort bug: a card dropped into Done went to the bottom) |
| 7 | Medium (accessibility) | Screen readers heard task IDs while dragging ("Picked up draggable item 3f2a…"), with no instructions; arrow keys moved cards 25 px at a time; each card was a `role=button` holding other buttons. | Tab to a card, press Space. | dnd-kit's default announcements and keyboard sensor. | Announcements and instructions with task titles and column names; arrows jump column to column; cards are labelled groups. Checked in the browser: picked up with Space, Left arrow, dropped with Space, announcements read "… moved to To do". | `task-board.tsx` |
| 8 | Medium (touch) | On the iPad, the task row's "…" menu, the time-block actions, "Remove subtask", "Delete entry" (goal history) and "Remove session" were invisible: they only appeared on hover. | Tasks list on an iPad: no "…" on rows. | `opacity-0` until `group-hover`, and touch screens never hover. | They hide only where there is a fine pointer (`pointer-fine:opacity-0`). "Remove session" and "Remove subtask" also grew from 14 px to 32 and 28 px. | `focus-view.tsx`, `goal-detail.tsx`, `timeline.tsx`, `task-editor.tsx`, `task-row.tsx` |
| 9 | Medium | A page that threw while rendering took the whole app down to Next's bare "Application error" screen; unknown addresses got the default unstyled 404. | — | No error boundary or not-found page. | `(os)/error.tsx` shows an in-app error state (data is safe, Try again, Overview, Copy details); `global-error.tsx` for a crash in the shell; a styled `not-found.tsx` (404.html). | `components/os/error-state.tsx`, `app/(os)/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; test `tests/error-state.test.tsx` |
| 10 | Low (motion) | Charts kept animating with Reduce motion on, for 1.5 s each time. | Settings → Reduce motion, open Analytics. | Recharts animates in JavaScript, which the CSS rule can't reach. | `useChartMotion()`: off when motion is reduced (system or Settings), otherwise 0.55 s ease-out. Analytics' area bars scale instead of animating their width. | `components/os/chart.tsx`, analytics, focus, overview widgets |
| 11 | Low | The Life balance radar cut off "Consistency" in narrow cards. | Overview at about 1430 px wide. | The chart's svg clipped its own axis labels. | The labels may draw into the card's padding. A page audit found no clipped chart labels after the fix. | `overview/widgets.tsx` |

### Refinements

- Forms: `Field` links its control to the error (or hint) with `aria-describedby`, sets
  `aria-invalid`, and after a failed save focus moves to the first field with an error,
  scrolled into view (`revealFirstError`).
- Touch targets: icon buttons (`icon`, `icon-sm`, `icon-xs`) and the chart/table switch
  answer to a 44 px square on touch screens (`hit-area`), without changing how they look.
- Empty states: an "all clear" tone in mint for good news (nothing overdue, nothing due
  today, no deadlines, everything scheduled); a filtered-out task list offers Clear
  filters; Kanban columns explain themselves and say "Drop it here" while dragging. The
  breathing glow stopped (ambient motion is rationed).
- Loading: skeletons are translucent (they suit the clear glass), fade in only after
  150 ms so a quick load never flashes them, and pulse softly (opacity only).

### Checked in the browser (production build, about 1430 px wide)

- Kanban: a mouse drag moved a card to In progress ("Do next" then read "Already in
  progress"); the keyboard moved it back. Focus stayed on the card.
- 404 page renders; no page overflows sideways; no clipped chart labels; the remaining
  "small targets" the audit reported are full-width text rows and inline links, which meet
  WCAG's spacing exception.
- Not exercised in a browser: the page error state (covered by its test), touch dragging on
  a real iPad, and the close guard in the real editors (covered by its test with the real
  dialog component).

## Increment 7: the phone navigation drawer at full frame rate

More (phone tab bar) now opens the drawer from the right, the side it's on; ☰ (iPad
portrait) still opens it from the left. The phone top bar shows the LIFE OS logo and name
on its left (just the logo under 375 px), and its buttons are 36 px there.

### Measured: opening and closing the drawer (production build, phone layout 448 px wide, 120 Hz)

Frame intervals from requestAnimationFrame, four opens and closes each.

| | Before | After |
|---|---|---|
| Opening: median frame | 16.6 ms (with frames up to 75 ms) | 8.3 ms (120 fps) in every run |
| Opening: frames over 20 ms | 11–13 of ~35 | 2–5 of ~60, all in the first frames as the drawer mounts |
| Opening: main-thread blocks over 50 ms | 54–69 ms on every open, one of them mid-slide | none during the slide |
| Closing: median frame | 16.7–24.8 ms | 8.4 ms |
| Closing: frames over 20 ms | 9–11 of ~22 | 4–7 of ~32, at the start and after the drawer is gone |

### Causes and fixes

1. **The animation library's keyframes kept the slide on the main thread.** tw-animate's
   enter/exit keyframes animate `filter` and `opacity` along with `transform`, even when
   they don't change, and that stops Chrome handing the slide to the compositor: each frame
   repainted the drawer's contents. The drawer now has its own transform-only keyframes,
   and the dimmed overlays fade with opacity-only keyframes. Tested alone: slow frames
   while opening went from 47 of 106 to 9 of 200. `globals.css`.
2. **The glass refraction built the drawer's lens mid-slide** (71 ms drawing the
   displacement map and encoding it, about 160 ms into the slide), and threw it away on
   every close. Lenses for moving surfaces are now built once they stop (only animations
   that end count; the tiles' scroll-driven rise doesn't), in idle time, and the last 24
   are kept, so reopening costs nothing. `features/shell/refraction.tsx`.
3. **Bent tiles under the moving drawer and fading overlay were re-filtered every frame.**
   While a dialog or drawer covers the page, tiles don't bend (the dim overlay hides it);
   the bend eases back in when it closes, as after scrolling. The drawer drops its own bend
   as it slides out. With this, opening went from a median 16.6 ms to 8.3 ms per frame.

A first version of fix 2 waited for every surface to stop before building any lens; the
tiles' scroll-driven animations never stop, so no surface got refraction. Caught in the
browser (0 lenses on the page) and fixed before this was committed.

### Not measured

- The iPad and phones themselves (only the PC's browser at phone width). Safari draws the
  glass with WebGL, not SVG filters; fix 1 applies there too.
- The tap frame itself still costs about 40–60 ms (mounting the drawer, and Radix
  restyling the page as it disables pointer events behind the drawer); it comes before the
  slide starts, so it delays the drawer slightly rather than making it stutter.

### Increment 7, continued

| # | Severity | Bug | Reproduce | Cause | Fix | Files |
|---|---|---|---|---|---|---|
| 12 | Medium (visual) | The Liquid flow snapped to a different picture under an open drawer or dialog, and snapped back when it closed. | Open More on a phone, close it: the background jumps. | While paused, the flow was drawn at its fixed resting time (the reduced-motion frame), and on resume at the live time. | The flow has its own clock that holds while paused and carries on from the frame showing (a long gap counts as one frame). Measured in the browser over three open/close cycles: the first frame after closing is one frame (0.034 s) after the last before opening; no step over 0.058 s. | `lib/design/flow-clock.ts`, `features/shell/canvas-refraction.tsx`; test `tests/flow-clock.test.ts` |

The drawer also has a Close button at its foot, within thumb reach (the ✕ at the top stays);
its spacing was tightened so the watch keeps its full face.
