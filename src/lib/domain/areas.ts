import type { AccentColor, Area, Priority, RadarDim } from "./types"

/** `color` is a CSS variable from the validated area palette (see globals.css). */
export const AREA_META: Record<Area, { label: string; color: string; dim: RadarDim }> = {
  work: { label: "Work", color: "var(--area-work)", dim: "productivity" },
  study: { label: "Study", color: "var(--area-study)", dim: "learning" },
  health: { label: "Health", color: "var(--area-health)", dim: "health" },
  mind: { label: "Mind", color: "var(--area-mind)", dim: "growth" },
  personal: { label: "Personal", color: "var(--area-personal)", dim: "growth" },
  finance: { label: "Finance", color: "var(--area-finance)", dim: "finance" },
}

/** Series order for multi-area charts. This order passed the colour-blindness checks; don't reshuffle. */
export const AREA_CHART_ORDER: Area[] = ["work", "health", "personal", "mind", "study", "finance"]

export const PRIORITY_META: Record<Priority, { label: string; short: string; color: AccentColor }> = {
  1: { label: "Urgent", short: "P1", color: "rose" },
  2: { label: "High", short: "P2", color: "amber" },
  3: { label: "Medium", short: "P3", color: "blue" },
  4: { label: "Low", short: "P4", color: "lilac" },
}

export const RADAR_META: Record<RadarDim, { label: string; how: string }> = {
  productivity: {
    label: "Productivity",
    how: "Share of tasks you finished out of those due in the last 7 days, blended with focus time against your daily focus target.",
  },
  learning: {
    label: "Learning",
    how: "Study-area focus minutes, study tasks finished and study habits kept in the last 7 days, against a 5-hour weekly learning baseline.",
  },
  health: {
    label: "Health",
    how: "How consistently you kept your Health-area habits over the last 7 days.",
  },
  finance: {
    label: "Finance",
    how: "Finance-area tasks finished and finance habits kept in the last 7 days. The full Finance module arrives in Phase 4.",
  },
  growth: {
    label: "Personal Growth",
    how: "Daily reflections written plus Mind and Personal habits kept over the last 7 days.",
  },
  consistency: {
    label: "Consistency",
    how: "Overall habit consistency over the last 7 days, blended with the number of days you were active at all.",
  },
}

/** Tailwind class fragments per accent, kept in one place so colours stay consistent. */
export const ACCENT_CLASSES: Record<AccentColor, { text: string; bg: string; soft: string; ring: string; fill: string }> = {
  violet: { text: "text-violet", bg: "bg-violet", soft: "bg-violet/15", ring: "ring-violet/40", fill: "var(--violet)" },
  cyan: { text: "text-cyan", bg: "bg-cyan", soft: "bg-cyan/15", ring: "ring-cyan/40", fill: "var(--cyan)" },
  blue: { text: "text-blue", bg: "bg-blue", soft: "bg-blue/15", ring: "ring-blue/40", fill: "var(--blue)" },
  mint: { text: "text-mint", bg: "bg-mint", soft: "bg-mint/15", ring: "ring-mint/40", fill: "var(--mint)" },
  amber: { text: "text-amber", bg: "bg-amber", soft: "bg-amber/15", ring: "ring-amber/40", fill: "var(--amber)" },
  rose: { text: "text-rose", bg: "bg-rose", soft: "bg-rose/15", ring: "ring-rose/40", fill: "var(--rose)" },
  lilac: { text: "text-lilac", bg: "bg-lilac", soft: "bg-lilac/15", ring: "ring-lilac/40", fill: "var(--lilac)" },
}
