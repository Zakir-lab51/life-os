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

export function useXP(data: LifeData | undefined) {
  return useMemo(() => {
    if (!data) return undefined
    const xp = computeXP({ tasks: data.tasks, habitLogs: data.habitLogs, sessions: data.sessions, reflections: data.reflections })
    return { xp, level: levelFromXP(xp.total) }
  }, [data])
}
