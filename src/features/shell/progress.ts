import { db } from "@/lib/db/db"
import { ensurePrefs, recordUnlocks, updatePrefs } from "@/lib/db/repo"
import { todayISO } from "@/lib/domain/dates"
import { ACHIEVEMENTS, computeStats, computeXP, levelFromXP } from "@/lib/domain/xp"
import type { LifeData } from "@/lib/domain/scores"
import type { Habit } from "@/lib/domain/types"

export function evaluateProgress(data: LifeData, today: string) {
  const stats = computeStats({ ...data, habits: data.habits as Habit[], today })
  const xp = computeXP(data)
  return { stats, xp, level: levelFromXP(xp.total), earned: ACHIEVEMENTS.filter((a) => a.check(stats)) }
}

let quietDepth = 0

/** True while a bulk load is running; the progress watcher records silently then. */
export function celebrationsMuted() {
  return quietDepth > 0
}

/**
 * Runs a bulk change (demo data, backup restore) without celebrating the
 * progress it brings in, then records achievements and level silently.
 * The quiet window lasts a moment longer so live queries can catch up.
 */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  quietDepth++
  try {
    const result = await fn()
    await syncProgressSilently()
    return result
  } finally {
    setTimeout(() => quietDepth--, 2000)
  }
}

/**
 * Records achievements and level without celebrating them. Used after loading
 * demo data or restoring a backup, so the user isn't flooded with toasts for
 * progress they didn't just make.
 */
export async function syncProgressSilently() {
  const [tasks, habits, habitLogs, sessions, reflections, goals, goalLogs, unlocks] = await Promise.all([
    db.tasks.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.focusSessions.toArray(),
    db.reflections.toArray(),
    db.goals.toArray(),
    db.goalLogs.toArray(),
    db.achievements.toArray(),
  ])
  const { earned, level } = evaluateProgress({ tasks, habits, habitLogs, sessions, reflections, goals, goalLogs }, todayISO())
  const have = new Set(unlocks.map((u) => u.id))
  const fresh = earned.filter((a) => !have.has(a.id)).map((a) => a.id)
  if (fresh.length) await recordUnlocks(fresh)
  const prefs = await ensurePrefs()
  if (level.level > prefs.lastSeenLevel) await updatePrefs({ lastSeenLevel: level.level })
}
