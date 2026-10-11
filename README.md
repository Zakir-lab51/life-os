# LIFE OS

A personal operating system for your day, tasks, habits, focus and progress. Dark-first, glassy, keyboard-friendly, and **local-first**: everything is stored in your browser (IndexedDB), so it works immediately with no account, server or API key.

## Run it

Requires Node.js 20.9+ (built and tested on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first launch an onboarding wizard asks a few questions; pick **Explore with demo data** to see every screen filled with clearly labelled sample data (removable in Settings → Data).

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest suite: recurrence, streaks, timer accuracy, scoring, planner, goals and forecasts, persistence and backups |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint (Next.js core web vitals + TypeScript rules) |
| `npm run build` / `npm start` | Production build / serve it |

## What works

- **Overview**: time-aware greeting, live clock, daily productivity score (with its breakdown), a rule-based daily briefing that explains every recommendation, Life Balance radar computed from your records, today's tasks, habits, focus, timeline, deadlines, weekly targets, level and data-driven insights. Widgets can be hidden and reordered.
- **Tasks**: create, edit, duplicate and delete (with undo); priorities, due dates and times, reminders, tags, life areas, subtasks, recurring tasks (daily / weekly on chosen days / monthly), dependencies with cycle prevention; a goal each task moves forward; list (smart, due, priority, manual drag-sort) and Kanban board with drag-and-drop; search, filters, built-in views; bulk actions; transparent "Do next" recommendations.
- **My Day**: drag-and-drop timeline (move, resize, keyboard arrows), drag tasks from the side list, conflict detection, overdue rescheduling, morning/evening routines, daily reflection, and **Plan my day**, an editable suggestion that only fills free time and never moves existing blocks.
- **Calendar**: month view of deadlines and time blocks with a day panel.
- **Goals** (Phase 2): weekly, monthly, quarterly, yearly and five-year goals, each measured by milestones, linked tasks, a number to reach (log the running total) or a habit's check-ins. Every goal shows its progress ring, a progress-over-time chart with an even-pace line, milestone timeline, linked tasks and supporting habits, and a plain-language forecast ("At your recent pace you'll finish around 8 Nov, 277 days before the deadline"). Goals can serve a bigger goal, building a tree from this week up to five years out. Filter by horizon and status; archive, reopen or delete with undo.
- **Life Roadmap** (Goals → Roadmap): every goal as a bar on a 3-month, 1-year or 5-year timeline, one lane per horizon, with progress fill, milestone diamonds and a line to the goal it serves. The bottom lane lists today's tasks and habits for those goals; pointing at an action or goal lights up its whole chain up to the long-term ambition and dims the rest.
- **Habits**: daily, specific-weekday and N-per-week habits; check-ins; kind streaks (one missed day per week counts as rest); best streaks; GitHub-style heatmaps; consistency stats; XP, levels and achievements.
- **Focus**: Pomodoro, custom and stopwatch modes; task-linked sessions; generated ambient sound (no audio files); distraction-free fullscreen; weekly chart, streak and session history. Timing comes from timestamps, so it stays exact in background tabs and across reloads, and a session that finished while the tab was closed is still recorded once.
- **Analytics**: 7/30/90-day range, KPIs with period-over-period change, score/tasks/focus/habit trends, area breakdowns, Life Balance and an activity heatmap. Each chart can switch to a table of the same numbers; heatmap cells show their value on hover.
- **Shell**: collapsible liquid-glass sidebar laid out like Settings (a search field that opens the command palette, your profile card with level and XP, then the tabs in groups split by thin lines), each tab with a 3D layered icon (colour tile, glass plate and symbol, like iOS 26) and live status, command palette (Ctrl/⌘+K), quick capture with natural syntax (Q), keyboard shortcuts (?), notification centre, quick-add menu (customisable), light/dark themes, reduced-motion support, responsive down to phones.
- **Data**: JSON backup and validated restore, tasks CSV export, demo data load/remove, full reset.

Modules still to come (Projects and weekly reviews later in Phase 2, then Second Brain and Finances) appear in the sidebar marked **P2–P4**. Their pages say plainly that they're planned and point to what already works today; nothing is faked.

## Architecture

```
src/
  app/                 Next.js App Router: one thin page per route, (os)/layout mounts the shell
  features/            One folder per module (overview, tasks, planner, calendar, goals,
                       habits, focus, analytics, settings, onboarding, planned, shell)
  components/ui/       shadcn/ui (Radix) primitives
  components/os/       LIFE OS building blocks: Panel, charts, heatmap, gauges, pickers
  lib/domain/          Pure, tested logic: dates, recurrence, tasks, capture parsing,
                       scheduling, planner, goals/forecasts, habits/streaks, focus timer,
                       scores, XP, insights
  lib/db/              Dexie database, repository (the only writer), live-query hooks,
                       demo data, backup/restore
  lib/validation/      Zod schemas for every input and for backups
  lib/stores/          Zustand: UI state and the persisted focus timer
tests/                 Vitest (runs the real Dexie code against fake-indexeddb)
prisma/schema.prisma   Relational model for the planned Phase 4 sync backend (not wired yet)
```

Key decisions:

- **Local-first.** Dexie + `useLiveQuery` means every screen reads the same live data, so finishing a task updates the dashboard, analytics, XP and sidebar at once. `lib/db/repo.ts` is the single write path, which keeps a future sync layer to one seam.
- **Derived, not duplicated.** Scores, streaks, XP and insights are computed from the records themselves. Undoing an action undoes its XP, and nothing can double-count. Activity events carry unique `dedupeKey`s.
- **Client-rendered app shell.** Data lives in the browser, so the server prerenders only a boot screen (`ClientGate`). That's also why the whole app can be exported as static files: `GITHUB_PAGES=1 next build` writes `out/` for https://zakir-lab51.github.io/life-os/.
- **No AI, by choice.** The briefing, recommendations, Plan My Day and insights are transparent rules that show their reasoning. LIFE OS uses no AI service and sends nothing anywhere (an AI assistant was considered and dropped).

### How the numbers are calculated

- **Daily score (0–100)**: tasks finished ÷ (finished + still due by that day), weighted 45%; focus minutes ÷ daily target (only once you've used Focus), 30%; due daily/weekday habits kept, 25%. Missing parts are left out and the weights re-balanced.
- **Life Balance (last 7 days)**: Productivity = due-task completion blended with focus vs. target; Learning = study-area focus + finished study tasks + study habits against a 5-hour weekly baseline; Health = health-habit consistency; Finance = finance tasks and habits; Personal Growth = reflections (5 per week = full) blended with mind/personal habits; Consistency = overall habit consistency blended with active days. Areas with nothing tracked show as "not tracked" rather than zero.
- **Streaks**: a missed due day is forgiven as a rest day if no other rest was used in the previous 7 days; today never breaks a streak until it's over. Weekly-count habits streak in weeks.
- **XP**: task 10 (+5 urgent/high), habit check-in 5, focus 1 per 5 minutes capped at 4 hours a day, reflection 10, milestone 15, achieved goal 20 (week) / 40 (month) / 60 (quarter) / 100 (year) / 150 (five years). Nothing is ever deducted for missed days.
- **Goal progress**: milestones reached ÷ milestones; linked tasks finished ÷ linked tasks; for a number, (latest total − start) ÷ (target − start); for a habit, check-ins since the start ÷ the target.
- **Goal outlook**: progress is compared with an even pace from start to deadline; within ±10 points is on track, above is ahead, below is behind. During the first tenth of a goal's time it's never called behind.
- **Forecast**: the recent pace is progress over the last 28 days (or since the start, counting the first day), and the finish date is when that pace reaches 100%. No date is predicted in a goal's first three days or without recent progress.
- **Default deadlines**: the end of the chosen week, month, quarter or year (five years for a five-year goal); if less than a quarter of that period is left, the end of the next one.

## Changing the design

The whole look comes from the **DESIGN CONTROLS** block near the top of `src/app/globals.css`: accent hue and saturation, corner roundness, glass blur and opacity, background glow, interface size, font, and the background (animated scene or photo) with its dimming and blur. Every colour, corner and surface is calculated from them, so a restyle never touches component code.

- **Design studio** (Settings → Appearance): pick a look (Violet glass, Ocean, Aurora, Ember, Rose, Mono), then fine-tune accent colour, colour intensity, corner roundness, glass, background glow, interface size and font. Changes apply instantly and are saved with your preferences; a tiny script in `<head>` repaints your saved design before the app loads, so there's no flash.
- **Glass**: Transparency (solid → clear) and Blur (sharp → frosted) are separate sliders, and picking a look never changes them. Material is the finish: Liquid glass (default) is nearly clear with a thick glossy rim, richer colour behind the glass, glass menus and dialogs, a specular glint where light from the top left catches the rim, and real refraction at the edges. The rim is shaped like real glass (`src/lib/design/lens.ts`: a convex squircle bending light at n = 1.5, after kube.io's "Liquid Glass in the browser"), so the backdrop is pulled inwards in a thin, strong band at the edge; Chrome and Edge apply it with SVG displacement maps (`src/features/shell/refraction.tsx`), and the top bar splits colour faintly at its rim like real glass. Frosted is matte. Every bit of the effect is scaled by `--glass-sheen` (the `glass` utility in `globals.css`, used by panels, the sidebar and the top bar), so Frosted simply sets it to 0. Write only the unprefixed `backdrop-filter` in CSS: the build adds the Safari prefix, and writing both makes it keep only the `-webkit-` one, which Chrome ignores.
- **Background**: the default is **Liquid flow**, an animated scene made for liquid glass (`src/lib/design/scene.ts`): glossy ribbons of colour with clean curved edges and lit rims drift slowly behind the glass, so the bending at every glass edge is easy to see and moves as they do. Its colours come from the accent hue in OKLCH: deep jewel tones in dark mode (so white text stays readable; a test checks the contrast) and pastels in light mode, greyscale for Mono. It's drawn with WebGL at up to 60 frames a second (`canvas-refraction.tsx`), holds still when motion is reduced and pauses with the tab. The misty-mountains photo (Daniel Sessler on Unsplash) is still in `public/backgrounds`, in a full-size and a phone-size WebP. A veil of the page colour (Dimming) keeps text readable in light and dark mode. To add a photo, save both sizes there and list it in `PHOTOS` in `src/lib/design/design.ts`; choosing a look never changes the background.
- **Design code**: "Copy design code" gives a one-line JSON of the current look. Paste it into another LIFE OS, or hand it to Claude to make it the default.
- **Change the default or add a look**: edit `PRESETS` / `DEFAULT_DESIGN` in `src/lib/design/design.ts`. If you change the default, update the DESIGN CONTROLS defaults in `globals.css` to match (a test checks this).
- Life-area colours are fixed on purpose (they're validated for colour-blind readers) and don't follow the accent.

## Published copy, offline and iPad

- **Live at https://zakir-lab51.github.io/life-os/.** `npm run deploy:pages` runs the tests, builds the static copy (`npm run build:pages` → `out/`) and pushes it to the `gh-pages` branch, which GitHub Pages serves. Everything runs in the browser, so plain files are enough. For automatic deploys on every push, see `scripts/pages-workflow.yml`.
- **Works offline.** A service worker (`scripts/sw.template.js`, written to `out/sw.js` with the list of every file) keeps the whole app on the device, so it opens instantly and without a connection. New versions download in the background and a toast offers to reload.
- **iPad and iPhone.** Open the link in Safari, then Share → Add to Home Screen for a full-screen app with its own icon.
- **Your data stays on each device.** Nothing syncs: the published app, your PC's copy and the home-screen app each keep their own data (the home-screen app's storage is separate from Safari's). To move it, use Settings → Data & backup → Download backup on one device and Restore from backup on the other.
- **Glass refraction everywhere.** Chromium browsers bend everything behind the glass with an SVG filter (`refraction.tsx`). Safari and Firefox can't, so there the background (scene or photo) is drawn with WebGL and bent under each glass edge as it's drawn (`canvas-refraction.tsx`, same rim profile). JavaScript can't redraw that in step with the browser's own scrolling, so tiles let go of their bend while you scroll and it flows back when you stop; the sidebar and top bar keep theirs.

## Motion

Movement uses springs, tuned to feel like Apple's interfaces. `src/lib/motion.ts` has the springs for animated components (`SPRING`, `SPRING_SNAPPY`, `SPRING_BOUNCY`) and the MOTION block in `globals.css` has the matching CSS curves (`--ease-spring`, `--ease-spring-bouncy`, which trace a real damped spring with `linear()`).

- **Pages**: the title and each tile rise into place one after another (`PageTransition` + `Panel`).
- **Scrolling**: mouse-wheel and trackpad scrolling glide instead of stepping (`smooth-scroll.tsx`, Lenis); touch scrolling stays the device's own. Tiles coming up from the bottom of the screen rise and grow into place, driven by the scroll position itself (CSS scroll-driven animations, Chrome and Safari 26+). The soft background glow holds still, because anything moving under the glass makes every glass surface re-blur on every frame; the Liquid flow scene is the one deliberate exception, kept slow and capped at 60 frames a second.
- **Glass**: a soft light follows the pointer across glass surfaces, and on touch screens the glass lights up where you touch it (`glass-pointer.tsx`).
- **Press**: buttons and nav items dip when pressed and spring back (the `pressable` utility).
- **Sidebar icons**: each tab's layered icon (`layered-icon.tsx`) spreads its layers apart and tilts towards the pointer on hover, presses flat when tapped, and the selected one floats gently; the highlighter glides to the next tab you pick.
- **Overlays**: menus, popovers, dialogs and sheets open on a spring and close quickly.
- **Navigation**: the highlighter pill glides between items; hover states fade in.
- **Theme**: switching spreads the new theme in a circle from the toggle (View Transitions), and its icon rotates.
- **Numbers**: the overview clock and score roll their digits (`RollingText`).
- Everything respects Reduce motion (system setting or Settings → Appearance).

## Notes

- Reminders fire while LIFE OS is open in a tab (local mode has no background push). System notifications are optional in Settings.
- Clearing this site's data in your browser deletes LIFE OS data. Download a backup from Settings → Data.
- Charts use a colour-blind-validated categorical palette for life areas (see `globals.css`).
