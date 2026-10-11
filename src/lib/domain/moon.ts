/** Length of a lunar month (new moon to new moon), in days. */
export const SYNODIC_MONTH = 29.530588853
/** A known new moon: 6 January 2000, 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

/** Where the moon is in its cycle at `date`: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - NEW_MOON) / 86_400_000
  const p = (days / SYNODIC_MONTH) % 1
  return p < 0 ? p + 1 : p
}

const NAMES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"] as const

export function moonPhaseName(phase: number): (typeof NAMES)[number] {
  return NAMES[Math.round(phase * 8) % 8]
}

/**
 * SVG path of the lit part of the moon for a moon-phase disc at (cx, cy), radius r:
 * the lit limb (right while waxing, left while waning) closed by the terminator, an
 * ellipse that bulges towards the lit side while gibbous and away from it while a crescent.
 */
export function moonPath(cx: number, cy: number, r: number, phase: number): string {
  const k = Math.cos(2 * Math.PI * phase) // 1 at new moon, -1 at full
  const waxing = phase < 0.5
  const rx = Math.abs(k) * r
  const limb = waxing ? 1 : 0
  const terminator = waxing ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0
  const f = (n: number) => +n.toFixed(2)
  return `M${f(cx)} ${f(cy - r)} A${f(r)} ${f(r)} 0 0 ${limb} ${f(cx)} ${f(cy + r)} A${f(rx)} ${f(r)} 0 0 ${terminator} ${f(cx)} ${f(cy - r)} Z`
}
