"use client"

import { useMemo } from "react"
import { useLifeData, usePrefs, useToday } from "@/lib/db/hooks"
import { computeXP, levelFromXP } from "@/lib/domain/xp"
import type { LifeData } from "@/lib/domain/scores"
import type { Prefs } from "@/lib/domain/types"

export interface Life {
  data: LifeData
  prefs: Prefs
  today: string
}

/** Everything most screens need. `undefined` while IndexedDB is loading. */
export function useLife(): Life | undefined {
  const data = useLifeData()
  const prefs = usePrefs()
  const today = useToday()
  return useMemo(() => (data && prefs ? { data, prefs, today } : undefined), [data, prefs, today])
}

// computed once per change of data, however many places show it (data objects are shared)
const xpCache = new WeakMap<LifeData, { xp: ReturnType<typeof computeXP>; level: ReturnType<typeof levelFromXP> }>()

export function useXP(data: LifeData | undefined) {
  if (!data) return undefined
  let hit = xpCache.get(data)
  if (!hit) {
    const xp = computeXP({ tasks: data.tasks, habitLogs: data.habitLogs, sessions: data.sessions, reflections: data.reflections, goals: data.goals })
    hit = { xp, level: levelFromXP(xp.total) }
    xpCache.set(data, hit)
  }
  return hit
}
