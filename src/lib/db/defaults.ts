import { DEFAULT_DESIGN, FIXED_FINISH } from "@/lib/design/design"
import { QUICK_ACTIONS, RADAR_DIMS, WIDGET_IDS, type Prefs, type ProductivityStyle, type QuickActionId } from "@/lib/domain/types"

export const FOCUS_STYLES: Record<ProductivityStyle, { label: string; description: string; focusMin: number; shortBreakMin: number; longBreakMin: number; longEvery: number }> = {
  classic: { label: "Classic Pomodoro", description: "25 min focus, 5 min breaks", focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longEvery: 4 },
  deep: { label: "Deep work", description: "50 min focus, 10 min breaks", focusMin: 50, shortBreakMin: 10, longBreakMin: 20, longEvery: 3 },
  flow: { label: "Flow blocks", description: "90 min focus, 15 min breaks", focusMin: 90, shortBreakMin: 15, longBreakMin: 30, longEvery: 2 },
  flexible: { label: "Flexible", description: "Stopwatch-first, 45 min default", focusMin: 45, shortBreakMin: 10, longBreakMin: 20, longEvery: 3 },
}

export function defaultPrefs(now = new Date()): Prefs {
  const stamp = now.toISOString()
  return {
    id: "prefs",
    name: "",
    onboarded: false,
    dayStartMin: 8 * 60,
    dayEndMin: 22 * 60,
    weekStartsOn: 1,
    focus: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longEvery: 4, autoStartBreaks: true, dailyTargetMin: 120 },
    routines: {
      morning: [
        { id: "m-water", label: "Drink a glass of water" },
        { id: "m-stretch", label: "Stretch for 5 minutes" },
        { id: "m-plan", label: "Review today's plan" },
      ],
      evening: [
        { id: "e-tidy", label: "Tidy your desk" },
        { id: "e-plan", label: "Sketch tomorrow's top 3" },
        { id: "e-screens", label: "Screens off 30 min before bed" },
      ],
    },
    widgets: WIDGET_IDS.map((id) => ({ id, visible: true })),
    radarDims: [...RADAR_DIMS],
    quickActions: [...QUICK_ACTIONS].filter((a) => a !== "reflection"),
    seenQuickActions: [...QUICK_ACTIONS],
    notifications: { browser: false, reminders: true, focus: true, achievements: true },
    weeklyTargets: { tasks: 20, focusMin: 600, habitRate: 0.8 },
    lifeGoals: [],
    productivityStyle: "classic",
    focusAreas: ["work", "study", "health"],
    studyInterests: [],
    currency: "INR",
    motion: "system",
    design: { ...DEFAULT_DESIGN },
    designVersion: DESIGN_VERSION,
    lastSeenLevel: 0,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Version 2 made the animated "Liquid flow" the default background. */
const DESIGN_VERSION = 2

/** Fills in fields added in later versions so older saved prefs keep working. */
export function migratePrefs(saved: Partial<Prefs>): Prefs {
  const base = defaultPrefs()
  const merged = { ...base, ...saved } as Prefs
  merged.focus = { ...base.focus, ...(saved.focus ?? {}) }
  merged.notifications = { ...base.notifications, ...(saved.notifications ?? {}) }
  merged.weeklyTargets = { ...base.weeklyTargets, ...(saved.weeklyTargets ?? {}) }
  merged.routines = { ...base.routines, ...(saved.routines ?? {}) }
  merged.design = { ...base.design, ...(saved.design ?? {}) }
  // a design still on the old default photo moves to the new default background, once;
  // choosing the photo again afterwards sticks
  if ((saved.designVersion ?? 1) < 2 && merged.design.photo === "mountains") {
    merged.design = { ...merged.design, photo: DEFAULT_DESIGN.photo, photoDim: DEFAULT_DESIGN.photoDim, photoBlur: DEFAULT_DESIGN.photoBlur }
  }
  // the glass and background finish are no longer settings: every design gets the fixed one
  merged.design = { ...merged.design, ...FIXED_FINISH }
  merged.designVersion = DESIGN_VERSION
  const known = new Set(merged.widgets?.map((w) => w.id) ?? [])
  merged.widgets = [...(merged.widgets ?? []), ...base.widgets.filter((w) => !known.has(w.id))]
  // quick actions added since these prefs were saved start switched on, once; switching one off later sticks.
  // Prefs saved before this was tracked knew every action except "goal" (added with Goals).
  const seen = new Set<QuickActionId>(saved.seenQuickActions ?? QUICK_ACTIONS.filter((a) => a !== "goal"))
  const on = new Set([...merged.quickActions, ...base.quickActions.filter((a) => !seen.has(a))])
  merged.quickActions = QUICK_ACTIONS.filter((a) => on.has(a))
  merged.seenQuickActions = [...QUICK_ACTIONS]
  return merged
}
