# LIFE OS design and motion system

The rules the interface follows, and where each one lives in code. Values are the ones
in use today; change them in the source and this file together.

## Principles

- **Physical, precise, fast.** Apple's physicality (glass, springs, light), Linear's
  precision (a strict spacing and type scale, quiet borders), Raycast's speed (Ctrl+K for
  everything, instant feedback).
- **Feedback when you act, never on load.** Ticks, check-ins and badges animate when you
  change them, not every time a page opens with things already done.
- **Smoothness over decoration.** Effects are dropped before frames are (see Rendering
  quality).

## Space

The 4 px Tailwind scale throughout.

| Use | Value |
|---|---|
| Page gutter | 16 px (phone), 24 px (≥ 640), 32 px (≥ 1024); content max 1400 px |
| Between tiles | 16 px (`gap-4`) |
| Inside a tile | 20 px, 24 px from 640 px (`p-5 sm:p-6`) |
| Tile header to content | 16 px (`mb-4`) |
| List rows | 2 px apart (`space-y-0.5`), 6–8 px vertical padding |
| Sidebar groups | 12 px apart, split by a 1 px line |

## Type

The UI font comes from the design studio (`--font-ui`, default Plus Jakarta Sans).

| Role | Size / weight |
|---|---|
| Page title | 30 px, 35 px from 640 px · 600 · tight tracking · leading 1.1 |
| Tile title | 18 px · 600 · tight |
| Body | 14–15 px · 400–500 |
| Secondary | 12 px · `text-muted-foreground` on glass; `text-muted-backdrop` + `on-backdrop` straight on the background |
| Labels / eyebrows | 10–11 px · 600 · uppercase · 0.08–0.16 em tracking |
| Numbers | `tabular` figures everywhere a number can change |

## Shape

Everything scales from `--radius` (default 1 rem, the design studio's roundness):
controls `--radius-control` (pill at default roundness), tiles `--radius-panel` (1.75×),
dialogs `--radius-dialog` (1.625×), heroes `--radius-hero` (2×).

## Elevation and material

| Level | What | Material |
|---|---|---|
| 0 | Page background | Liquid flow (WebGL) or photo, shown as it is (no dimming or blur) |
| 1 | Tiles, sidebar, top bar | `.glass`: clear, 1 px blur + saturation, refraction at the rim, specular glint, rim light |
| 2 | Menus, popovers, dialogs, sheets, toasts | Glass with stronger blur (28 px) and a deeper shadow |
| Inline | Selected item, chips | `glass-pill` / tinted fills; never a glass surface inside another (it can't blur through it) |

Lighting: light comes from the top left. The specular ring (`.glass::after`) is brightest
at the top-left corner, with a fainter bounce at the bottom right; hover and touch add a
soft light at the pointer (`--glass-hover`, `glass-pointer.tsx`).

Borders: 1 px `--line` (7–10% of the foreground colour). Dense data never sits directly on
the background: always on a level-1 surface.

The glass finish is fixed (`FIXED_FINISH`): clear (a 10% surface tint), a 1 px blur, over
a background that is neither dimmed nor blurred. Glass tunes what shows through it for the
text on top: dark glass darkens the background (brightness 0.5, `--sheen-brighten`), light
glass lifts it slightly (1.06). Menus, dialogs and sheets keep their own heavier frosting
(28 px over a mostly solid fill), since they sit over the page's own text.

## Readability

With the clear glass, secondary text meets WCAG AA (4.5:1) over the body of every Liquid
flow ribbon on dark-mode tiles and straight on the background, in every colour preset; thin
edge highlights and shadow bands can dip below it. Light-mode tiles fall short over the two
darkest ribbons (see the quality report). `tests/text-contrast.test.ts` checks this from the
real tokens; `scripts/contrast-probe.js` and `scripts/contrast-measure.py` measure a live
page.

| Text | Colour | Light / dark lightness |
|---|---|---|
| Main | `--foreground` | 0.2 / 0.96 |
| Secondary, on glass | `--muted-foreground` | 0.37 / 0.77 |
| Secondary, straight on the background | `--muted-backdrop`, plus `on-backdrop` (a soft halo in the page colour) | 0.32 / 0.88 |
| Selected item's label | `--pill-foreground` on `glass-pill` (70% in light mode) | white |

- **Fade with colour, not opacity.** Past, planned or done things switch to the secondary
  colour (or lose their fill); stacking opacity on top of a muted colour drops below AA.
  Only disabled controls use 50% opacity (AA exempts them).
- **Text with no glass behind it** (page headers, filter chips) uses `text-muted-backdrop`
  and `on-backdrop`; `PageHeader` does this for you.

## States

| State | Treatment |
|---|---|
| Hover (pointer only) | Glass light follows the pointer; rows tint 4.5% foreground |
| Press | `pressable`: dips to `--press-scale` (0.96 default) in 0.12 s, springs back |
| Focus | 2 px `--ring` outline, visible only for keyboard (`focus-visible`) |
| Selected | `glass-pill` highlighter that glides between options |
| Disabled | 50% opacity, no pointer |
| Done | `strike is-done`: strike and muted colour fade in over 0.3 s |
| Touch targets | At least 44 px on coarse pointers (tick-boxes enlarge their hit area invisibly) |

## Motion

### Tokens

| Token | Use |
|---|---|
| `SPRING` (0.5 s, bounce 0.15) | Default: entrances, layout |
| `SPRING_SNAPPY` (0.32 s, bounce 0.12) | Highlighters, small swaps, rolling digits |
| `SPRING_BOUNCY` (0.45 s, bounce 0.32) | Icons that pop |
| `--ease-out` | Fades and colour changes |
| `--ease-in` | Things leaving (overlays close in 0.16 s) |
| `--ease-spring`, `--ease-spring-bouncy` | The same springs in CSS, as `linear()` curves |

JS springs live in `src/lib/motion.ts`, CSS curves in the MOTION block of
`src/app/globals.css`. Motion (`motion/react`) is the only animation library; CSS covers
what doesn't need JavaScript.

### Catalogue

| Moment | How |
|---|---|
| Page entrance | Title and tiles rise in turn (`PageTransition`, 45 ms stagger); the wrapper never fades (it would stop the glass blurring) |
| Scrolling | Wheel glides (Lenis); tiles rise into view from the bottom (CSS scroll-driven) |
| Navigation | Highlighter glides to the new tab (`layoutId`) |
| Dialogs and menus | Open on a spring (0.5 s), close fast (0.16 s); focus returns to what opened them |
| Task completed | Tick pops and draws its check; title's strike fades in |
| Habit checked in | Mark pops with a ring in the habit's colour |
| Numbers | Digits roll (`RollingText`): clock, score, stat tiles |
| Progress rings | Ease to the new value (1.1 s) |
| New notification | Bell badge pops |
| Theme switch | New theme spreads in a circle from the toggle (View Transitions) |
| Glass at rest | Tiles' bend eases back in 0.45 s after scrolling stops |

### Rules

- **Transform and opacity.** Animate `transform`, `scale`, `translate` and `opacity`.
  Exceptions are tiny SVG strokes (the check drawing, gauges).
- **Interruptible.** Springs retarget from where they are; nothing queues, so fast
  navigation never waits on an animation.
- **Feedback only on change.** Use `useJustChanged`, or for task rows that are rebuilt
  when ticked, `wasJustCompleted`.
- **Ambient motion is rationed.** Only these move on their own: the Liquid flow (30 fps),
  the watch's seconds, and the selected sidebar icon's float.
- **Reduce motion** (system setting or Settings → Appearance) cuts every CSS animation and
  transition short, stops Lenis, the flow, the watch hands and the scroll effects, and
  tells Motion to skip its animations.

## Rendering quality

Glass bending is the most expensive effect, so it follows `src/lib/design/quality.ts`:

| Level | Page tiles bend | Sidebar, top bar, dialogs bend | Liquid flow |
|---|---|---|---|
| 0 full | at rest only | yes | 30 fps |
| 1 balanced | no | yes | 30 fps |
| 2 light | no | no | 30 fps |
| 3 still | no | no | still |

`quality-monitor.tsx` samples frame times every 12 s; two samples in a row below ~50 fps
step down one level for the rest of the session. The background also pauses while a
dialog or menu is open.
